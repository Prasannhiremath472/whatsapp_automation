import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { BroadcastCampaign, BroadcastTemplate } from '@prisma/client';
import type { CreateBroadcastCampaignRequest, SaveBroadcastTemplateRequest } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { BROADCAST_SEND_DELAY_MS, BROADCAST_SEND_QUEUE } from './broadcast-queue.constants';
import type { BroadcastSendJob } from './broadcast.processor';

/** Fills {{name}}-style placeholders in a template body from a flat map. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BROADCAST_SEND_QUEUE) private readonly queue: Queue<BroadcastSendJob>,
  ) {}

  async listTemplates(tenantId: string): Promise<BroadcastTemplate[]> {
    return this.prisma.broadcastTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(tenantId: string, input: SaveBroadcastTemplateRequest): Promise<BroadcastTemplate> {
    const existing = await this.prisma.broadcastTemplate.findUnique({
      where: { tenantId_name: { tenantId, name: input.name } },
    });
    if (existing) {
      throw new ConflictException('A template with this name already exists');
    }
    return this.prisma.broadcastTemplate.create({
      data: {
        tenantId,
        name: input.name,
        body: input.body,
        metaTemplateName: input.metaTemplateName,
        metaTemplateLanguage: input.metaTemplateLanguage,
        metaVariableCount: input.metaVariableCount,
      },
    });
  }

  async listCampaigns(tenantId: string): Promise<(BroadcastCampaign & { _counts: Record<string, number> })[]> {
    const campaigns = await this.prisma.broadcastCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { template: true, recipients: { select: { status: true } } },
    });

    return campaigns.map((c) => {
      const _counts = { total: c.recipients.length, pending: 0, sent: 0, failed: 0 };
      for (const r of c.recipients) _counts[r.status] += 1;
      return { ...c, _counts };
    }) as unknown as (BroadcastCampaign & { _counts: Record<string, number> })[];
  }

  /**
   * Creates the campaign + one BroadcastRecipient row per recipient (status:
   * pending) — sourced from existing contactIds and/or a CSV-style list of
   * fresh phone numbers (upserted into Contact first, so a number that's
   * never messaged in still gets a normal Contact row) — then enqueues one
   * send job per recipient staggered by BROADCAST_SEND_DELAY_MS so the
   * whole batch doesn't fire in the same tick. Recipient rows are created
   * up front (not lazily by the worker) so the campaign's progress is
   * visible immediately, even before any job has run.
   *
   * Uses createMany + BullMQ addBulk rather than per-row create/queue.add
   * calls — at real campaign scale (thousands of recipients) N individual
   * round trips would be the actual bottleneck, not the WhatsApp send rate.
   */
  async createCampaign(
    tenantId: string,
    createdByUserId: string,
    input: CreateBroadcastCampaignRequest,
  ): Promise<BroadcastCampaign> {
    const template = await this.prisma.broadcastTemplate.findUnique({ where: { id: input.templateId } });
    if (!template || template.tenantId !== tenantId) {
      throw new BadRequestException('templateId must reference a template in your tenant');
    }

    if (template.metaTemplateName && typeof template.metaVariableCount === 'number') {
      for (const r of input.csvRecipients) {
        const count = r.templateVariables?.length ?? 0;
        if (count !== template.metaVariableCount) {
          throw new BadRequestException(
            `Recipient ${r.waId} has ${count} templateVariables but template "${template.name}" requires ${template.metaVariableCount}`,
          );
        }
      }
    }

    const existingContacts = await this.prisma.contact.findMany({
      where: { id: { in: input.contactIds }, tenantId },
    });
    if (existingContacts.length !== input.contactIds.length) {
      throw new BadRequestException('One or more contactIds do not belong to your tenant');
    }

    // Upsert CSV rows into Contact one at a time — createMany can't
    // upsert-on-conflict across all DB providers, and campaign creation is
    // an infrequent admin action (not the hot path), so N upserts here is
    // an acceptable trade against the complexity of a bulk upsert query.
    const csvContactIds: { id: string; templateVariables?: string[] }[] = [];
    for (const r of input.csvRecipients) {
      const contact = await this.prisma.contact.upsert({
        where: { tenantId_waId: { tenantId, waId: r.waId } },
        update: r.name ? { profileName: r.name } : {},
        create: { tenantId, waId: r.waId, profileName: r.name },
      });
      csvContactIds.push({ id: contact.id, templateVariables: r.templateVariables });
    }

    const recipientRows = [
      ...existingContacts.map((c) => ({ contactId: c.id, templateVariables: undefined as string[] | undefined })),
      ...csvContactIds.map((c) => ({ contactId: c.id, templateVariables: c.templateVariables })),
    ];

    const campaign = await this.prisma.broadcastCampaign.create({
      data: { tenantId, templateId: template.id, name: input.name, status: 'sending', createdByUserId },
    });

    await this.prisma.broadcastRecipient.createMany({
      data: recipientRows.map((r) => ({
        campaignId: campaign.id,
        contactId: r.contactId,
        status: 'pending' as const,
        templateVariables: r.templateVariables ? (r.templateVariables as unknown as object) : undefined,
      })),
    });

    const recipients = await this.prisma.broadcastRecipient.findMany({
      where: { campaignId: campaign.id },
      select: { id: true },
    });

    await this.queue.addBulk(
      recipients.map((recipient, index) => ({
        name: 'send-broadcast-message',
        data: { tenantId, campaignId: campaign.id, recipientId: recipient.id },
        opts: { delay: index * BROADCAST_SEND_DELAY_MS, removeOnComplete: true, removeOnFail: 100 },
      })),
    );

    this.logger.log(`Created campaign ${campaign.id} tenantId=${tenantId} recipients=${recipients.length}`);

    return campaign;
  }

  async findCampaignOrThrow(tenantId: string, campaignId: string): Promise<BroadcastCampaign> {
    const campaign = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }
}
