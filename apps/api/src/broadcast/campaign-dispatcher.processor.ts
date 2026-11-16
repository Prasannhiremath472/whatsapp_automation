import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { Prisma, type BroadcastCampaign, type BroadcastRecipient, type Contact, type MessageTemplate, type WhatsappConnection } from '@prisma/client';
import type { Audience, VariableMapping } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  WHATSAPP_PROVIDER,
  WhatsAppSendError,
  type WhatsAppProvider,
} from '../whatsapp-connections/whatsapp-provider.interface';
import { AudienceService } from './audience.service';
import {
  BROADCAST_SEND_QUEUE,
  DISPATCHER_LEASE_MS,
  MAX_SEND_ATTEMPTS,
  type DispatchCampaignJob,
} from './broadcast-queue.constants';
import { MockReceiptSimulator } from './mock-receipt.simulator';
import { buildTemplateComponents, renderBody, resolveVariables } from './variable-resolver';

type ClaimedRecipient = BroadcastRecipient & { contact: Contact };

type SendOutcome =
  | { kind: 'sent' }
  | { kind: 'skipped' }
  | { kind: 'failed' }
  | { kind: 'retry'; message: string }
  | { kind: 'auth'; message: string };

/**
 * Drives one campaign at a time from "running" to "completed".
 *
 * - Exactly one dispatcher owns a campaign (DB lease), and a tenant only runs
 *   one campaign at a time, so the account's WhatsApp rate limit is respected.
 * - Recipients are claimed in small batches (BROADCAST_RATE_PER_SECOND per
 *   second). Campaign status is re-read between batches, which is what makes
 *   pause / cancel take effect within about a second.
 * - Sends are at-most-once: a recipient is marked "sending" before the API
 *   call, and anything left "sending" by a crash is failed (not re-sent) so a
 *   customer is never messaged twice by accident. Users can retry failures.
 */
@Processor(BROADCAST_SEND_QUEUE, { concurrency: 4 })
export class CampaignDispatcher extends WorkerHost {
  private readonly logger = new Logger(CampaignDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audience: AudienceService,
    private readonly receipts: MockReceiptSimulator,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {
    super();
  }

  async process(job: Job<DispatchCampaignJob>): Promise<void> {
    await this.run(job.data.campaignId);
  }

  private get ratePerSecond(): number {
    return this.config.get<number>('BROADCAST_RATE_PER_SECOND') ?? 20;
  }

  /** Public so tests can drive a campaign without the queue. */
  async run(campaignId: string): Promise<void> {
    const leaseUntil = () => new Date(Date.now() + DISPATCHER_LEASE_MS);

    const acquired = await this.prisma.broadcastCampaign.updateMany({
      where: {
        id: campaignId,
        status: 'running',
        OR: [{ dispatcherLockedUntil: null }, { dispatcherLockedUntil: { lt: new Date() } }],
      },
      data: { dispatcherLockedUntil: leaseUntil() },
    });
    if (acquired.count === 0) return; // finished, paused, or owned by another worker

    try {
      const campaign = await this.prisma.broadcastCampaign.findUnique({
        where: { id: campaignId },
        include: { template: true },
      });
      if (!campaign || campaign.status !== 'running') return;

      if (await this.shouldYieldToOtherCampaign(campaign)) return;

      const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId: campaign.tenantId } });
      if (!connection || connection.connectionStatus !== 'connected') {
        await this.pause(campaignId, 'The WhatsApp account is not connected. Reconnect it, then resume.');
        return;
      }
      if (campaign.template.status !== 'approved') {
        await this.pause(campaignId, 'The message template is no longer approved. Fix the template, then resume.');
        return;
      }

      await this.recoverInterrupted(campaignId);
      await this.materialize(campaign);

      const mapping = campaign.variableMapping as unknown as VariableMapping;
      const rate = this.ratePerSecond;

      for (;;) {
        const fresh = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
        if (fresh?.status !== 'running') return; // paused / cancelled while we were working

        await this.prisma.broadcastCampaign.update({
          where: { id: campaignId },
          data: { dispatcherLockedUntil: leaseUntil() },
        });

        const startedAt = Date.now();
        const batch = await this.claimBatch(campaignId, rate);
        if (batch.length === 0) {
          await this.finalize(campaignId);
          return;
        }

        const outcomes = await Promise.all(batch.map((r) => this.sendOne(campaign, campaign.template, connection, mapping, r)));
        await this.settleBatch(campaignId, outcomes);

        const auth = outcomes.find((o): o is Extract<SendOutcome, { kind: 'auth' }> => o.kind === 'auth');
        if (auth) {
          await this.pause(campaignId, `WhatsApp rejected the account credentials (${auth.message}). Reconnect the account, then resume.`.slice(0, 190));
          return;
        }

        const retries = outcomes.filter((o) => o.kind === 'retry').length;
        if (retries > 0) {
          // Meta is throttling or having a bad moment: back off before the next batch.
          const worstAttempt = Math.max(...batch.map((r) => r.attempts));
          await this.sleep(Math.min(60_000, 5_000 * 2 ** Math.max(0, worstAttempt - 1)));
        } else if (batch.length >= rate) {
          const elapsed = Date.now() - startedAt;
          if (elapsed < 1000) await this.sleep(1000 - elapsed);
        }
      }
    } catch (err) {
      this.logger.error(`Dispatcher crashed for campaign ${campaignId}: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    } finally {
      await this.prisma.broadcastCampaign
        .updateMany({ where: { id: campaignId }, data: { dispatcherLockedUntil: null } })
        .catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Overridable so tests do not really wait. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** One campaign per tenant at a time: yield to an earlier-started campaign that is actively sending. */
  private async shouldYieldToOtherCampaign(campaign: BroadcastCampaign): Promise<boolean> {
    const other = await this.prisma.broadcastCampaign.findFirst({
      where: {
        tenantId: campaign.tenantId,
        id: { not: campaign.id },
        status: 'running',
        dispatcherLockedUntil: { gt: new Date() },
      },
      select: { id: true, startedAt: true },
    });
    if (!other) return false;
    const otherFirst =
      (other.startedAt?.getTime() ?? 0) < (campaign.startedAt?.getTime() ?? 0) ||
      ((other.startedAt?.getTime() ?? 0) === (campaign.startedAt?.getTime() ?? 0) && other.id < campaign.id);
    return otherFirst;
  }

  private async pause(campaignId: string, reason: string): Promise<void> {
    await this.prisma.broadcastCampaign.updateMany({
      where: { id: campaignId, status: 'running' },
      data: { status: 'paused', statusReason: reason.slice(0, 190) },
    });
    this.logger.warn(`Campaign ${campaignId} paused: ${reason}`);
  }

  /** Anything still "sending" belongs to a crashed dispatcher: fail it rather than risk a duplicate send. */
  private async recoverInterrupted(campaignId: string): Promise<void> {
    const stuck = await this.prisma.broadcastRecipient.updateMany({
      where: { campaignId, status: 'sending' },
      data: {
        status: 'failed',
        errorCode: 'interrupted',
        errorDetail: { message: 'Sending was interrupted (server restart). Use "Retry failed" to send again.' },
      },
    });
    if (stuck.count > 0) {
      await this.prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { failedCount: { increment: stuck.count } } });
      this.logger.warn(`Campaign ${campaignId}: ${stuck.count} interrupted recipient(s) marked failed`);
    }
  }

  /** Creates the recipient rows for the audience, exactly once (idempotent if it crashes midway). */
  private async materialize(campaign: BroadcastCampaign): Promise<void> {
    if (campaign.materializedAt) return;
    for await (const batch of this.audience.iterate(campaign.tenantId, campaign.audience as unknown as Audience)) {
      await this.prisma.broadcastRecipient.createMany({
        data: batch.map((c) => ({
          campaignId: campaign.id,
          contactId: c.id,
          status: c.optedOut ? ('skipped' as const) : ('pending' as const),
          errorCode: c.optedOut ? 'opted_out' : null,
        })),
        skipDuplicates: true,
      });
    }
    const groups = await this.prisma.broadcastRecipient.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    });
    const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    await this.prisma.broadcastCampaign.update({
      where: { id: campaign.id },
      data: {
        materializedAt: new Date(),
        totalRecipients: groups.reduce((sum, g) => sum + g._count._all, 0),
        skippedCount: n('skipped'),
        failedCount: n('failed'),
        sentCount: n('sent') + n('delivered') + n('read'),
        deliveredCount: n('delivered') + n('read'),
        readCount: n('read'),
      },
    });
  }

  private async claimBatch(campaignId: string, size: number): Promise<ClaimedRecipient[]> {
    const pending = await this.prisma.broadcastRecipient.findMany({
      where: { campaignId, status: 'pending' },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: size,
    });
    if (pending.length === 0) return [];
    const ids = pending.map((p) => p.id);
    await this.prisma.broadcastRecipient.updateMany({
      where: { id: { in: ids }, status: 'pending' },
      data: { status: 'sending', attempts: { increment: 1 } },
    });
    return this.prisma.broadcastRecipient.findMany({
      where: { id: { in: ids }, status: 'sending' },
      include: { contact: true },
    });
  }

  private async sendOne(
    campaign: BroadcastCampaign,
    template: MessageTemplate,
    connection: WhatsappConnection,
    mapping: VariableMapping,
    recipient: ClaimedRecipient,
  ): Promise<SendOutcome> {
    const { contact } = recipient;

    // The contact may have replied STOP after the campaign started.
    if (contact.optedOut) {
      await this.markRecipient(recipient.id, 'skipped', 'opted_out', 'Contact opted out');
      return { kind: 'skipped' };
    }

    const variables = resolveVariables(template, mapping, contact);
    if (!variables.ok) {
      await this.markRecipient(recipient.id, 'failed', 'missing_variable', variables.reason);
      return { kind: 'failed' };
    }
    const components = buildTemplateComponents(template, variables.header, variables.body, campaign.headerMediaUrl);

    let waMessageId: string;
    try {
      ({ waMessageId } = await this.provider.sendTemplateMessage(connection, contact.waId, template.name, template.language, components));
    } catch (err) {
      const e = err instanceof WhatsAppSendError ? err : new WhatsAppSendError(err instanceof Error ? err.message : String(err), undefined, undefined, false);
      if (e.authFailure) {
        await this.revertToPending(recipient.id);
        return { kind: 'auth', message: e.message };
      }
      if (e.transient && recipient.attempts < MAX_SEND_ATTEMPTS) {
        await this.revertToPending(recipient.id);
        return { kind: 'retry', message: e.message };
      }
      await this.markRecipient(recipient.id, 'failed', e.code ?? 'send_failed', e.message);
      return { kind: 'failed' };
    }

    // The message is out. Record it; if bookkeeping fails, never re-send.
    try {
      const conversation =
        (await this.prisma.conversation.findFirst({
          where: { tenantId: campaign.tenantId, contactId: contact.id, whatsappConnectionId: connection.id, status: { not: 'closed' } },
          orderBy: { createdAt: 'desc' },
        })) ??
        (await this.prisma.conversation.create({
          data: { tenantId: campaign.tenantId, contactId: contact.id, whatsappConnectionId: connection.id, status: 'open' },
        }));
      const message = await this.prisma.message.create({
        data: {
          tenantId: campaign.tenantId,
          conversationId: conversation.id,
          direction: 'outbound',
          senderType: 'system',
          messageType: 'template',
          waMessageId,
          status: 'sent',
          content: {
            templateName: template.name,
            language: template.language,
            bodyParams: variables.body,
            body: renderBody(template, variables.body),
            campaignId: campaign.id,
          },
        },
      });
      await this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      await this.prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: 'sent', waMessageId, messageId: message.id, sentAt: new Date(), errorCode: null, errorDetail: Prisma.DbNull },
      });
    } catch (err) {
      this.logger.error(`Sent ${waMessageId} but failed to record it for recipient ${recipient.id}: ${(err as Error).message}`);
      await this.prisma.broadcastRecipient
        .update({ where: { id: recipient.id }, data: { status: 'sent', waMessageId, sentAt: new Date() } })
        .catch(() => undefined);
    }

    this.receipts.simulate(connection, waMessageId, contact.waId);
    return { kind: 'sent' };
  }

  private async markRecipient(id: string, status: 'failed' | 'skipped', code: string, message: string): Promise<void> {
    await this.prisma.broadcastRecipient.update({
      where: { id },
      data: { status, errorCode: code, errorDetail: { message: message.slice(0, 500) } },
    });
  }

  private async revertToPending(id: string): Promise<void> {
    await this.prisma.broadcastRecipient.update({ where: { id }, data: { status: 'pending' } });
  }

  /** Applies one batch's results to the campaign's counters in a single write. */
  private async settleBatch(campaignId: string, outcomes: SendOutcome[]): Promise<void> {
    const count = (kind: SendOutcome['kind']) => outcomes.filter((o) => o.kind === kind).length;
    const sent = count('sent');
    const failed = count('failed');
    const skipped = count('skipped');
    if (sent + failed + skipped === 0) return;
    await this.prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        sentCount: { increment: sent },
        failedCount: { increment: failed },
        skippedCount: { increment: skipped },
      },
    });
  }

  private async finalize(campaignId: string): Promise<void> {
    const c = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
    if (!c) return;
    let status: 'completed' | 'failed' = 'completed';
    let reason: string | null = null;
    if (c.sentCount === 0 && c.failedCount > 0) {
      status = 'failed';
      reason = 'All messages failed to send';
    } else if (c.sentCount === 0) {
      reason = 'No eligible recipients (all contacts opted out)';
    }
    await this.prisma.broadcastCampaign.updateMany({
      where: { id: campaignId, status: 'running' },
      data: { status, statusReason: reason, completedAt: new Date() },
    });
    this.logger.log(`Campaign ${campaignId} ${status}: sent=${c.sentCount} failed=${c.failedCount} skipped=${c.skippedCount}`);
  }
}
