import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp-connections/whatsapp-provider.interface';
import { BROADCAST_SEND_QUEUE } from './broadcast-queue.constants';
import { renderTemplate } from './broadcast.service';

export interface BroadcastSendJob {
  tenantId: string;
  campaignId: string;
  recipientId: string;
}

/**
 * Sends one recipient's message per job, reusing the same WhatsAppProvider
 * agent replies use, then records the result as a normal outbound Message
 * (senderType: system) so it shows up in that contact's regular conversation
 * thread — a broadcast isn't a separate inbox, it's just another way a
 * message gets sent. After each job, checks whether the campaign has any
 * pending recipients left and flips its status to completed/failed if not.
 */
@Processor(BROADCAST_SEND_QUEUE)
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsappProvider: WhatsAppProvider,
  ) {
    super();
  }

  async process(job: Job<BroadcastSendJob>): Promise<void> {
    const { tenantId, campaignId, recipientId } = job.data;

    const recipient = await this.prisma.broadcastRecipient.findUnique({
      where: { id: recipientId },
      include: { contact: true, campaign: { include: { template: true } } },
    });
    if (!recipient || recipient.campaign.tenantId !== tenantId) {
      this.logger.warn(`Recipient ${recipientId} not found or tenant mismatch; skipping`);
      return;
    }

    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    if (!connection) {
      await this.markRecipient(recipientId, 'failed', { message: 'No WhatsApp connection for tenant' });
      await this.maybeCompleteCampaign(campaignId);
      return;
    }

    const isMetaTemplate = !!recipient.campaign.template.metaTemplateName;
    const text = isMetaTemplate
      ? recipient.campaign.template.body
      : renderTemplate(recipient.campaign.template.body, {
          name: recipient.contact.profileName ?? recipient.contact.displayName ?? recipient.contact.waId,
        });

    // Every conversation for this contact/connection gets the broadcast
    // message recorded, even if none exists yet — findOrCreate mirrors
    // InboxService's own conversation lookup (kept lightweight here since
    // this is a send-only path, not full ingestion).
    const conversation =
      (await this.prisma.conversation.findFirst({
        where: { tenantId, contactId: recipient.contactId, whatsappConnectionId: connection.id, status: { not: 'closed' } },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.conversation.create({
        data: { tenantId, contactId: recipient.contactId, whatsappConnectionId: connection.id, status: 'open' },
      }));

    let message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'system',
        messageType: isMetaTemplate ? 'template' : 'text',
        content: isMetaTemplate
          ? {
              templateName: recipient.campaign.template.metaTemplateName,
              language: recipient.campaign.template.metaTemplateLanguage ?? 'en_US',
              bodyParams: (recipient.templateVariables as string[] | null) ?? [],
            }
          : { body: text },
        status: 'queued',
      },
    });

    try {
      const { waMessageId } = isMetaTemplate
        ? await this.whatsappProvider.sendTemplateMessage(
            connection,
            recipient.contact.waId,
            recipient.campaign.template.metaTemplateName as string,
            recipient.campaign.template.metaTemplateLanguage ?? 'en_US',
            (recipient.templateVariables as string[] | null) ?? [],
          )
        : await this.whatsappProvider.sendTextMessage(connection, recipient.contact.waId, text);
      message = await this.prisma.message.update({ where: { id: message.id }, data: { waMessageId, status: 'sent' } });
      await this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      await this.markRecipient(recipientId, 'sent', null, message.id);
    } catch (err) {
      const errorDetail = { message: err instanceof Error ? err.message : String(err) };
      await this.prisma.message.update({ where: { id: message.id }, data: { status: 'failed', errorDetail } });
      await this.markRecipient(recipientId, 'failed', errorDetail, message.id);
      this.logger.warn(`Broadcast send failed recipientId=${recipientId}: ${errorDetail.message}`);
    }

    await this.maybeCompleteCampaign(campaignId);
  }

  private async markRecipient(
    recipientId: string,
    status: 'sent' | 'failed',
    errorDetail: Record<string, unknown> | null,
    messageId?: string,
  ): Promise<void> {
    await this.prisma.broadcastRecipient.update({
      where: { id: recipientId },
      data: {
        status,
        ...(errorDetail ? { errorDetail: errorDetail as object } : {}),
        messageId,
        sentAt: status === 'sent' ? new Date() : undefined,
      },
    });
  }

  private async maybeCompleteCampaign(campaignId: string): Promise<void> {
    const pendingCount = await this.prisma.broadcastRecipient.count({
      where: { campaignId, status: 'pending' },
    });
    if (pendingCount > 0) return;

    const failedCount = await this.prisma.broadcastRecipient.count({ where: { campaignId, status: 'failed' } });
    const totalCount = await this.prisma.broadcastRecipient.count({ where: { campaignId } });

    await this.prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: { status: failedCount === totalCount ? 'failed' : 'completed' },
    });
  }
}
