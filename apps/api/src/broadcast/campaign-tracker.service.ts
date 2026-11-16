import { Injectable, Logger } from '@nestjs/common';
import type { BroadcastRecipientStatus } from '@prisma/client';
import type { WebhookStatus } from '../webhook/webhook-payload.types';
import { PrismaService } from '../prisma/prisma.service';

/** Progress order of a message; webhooks can arrive out of order, so only forward moves count. */
const RANK: Partial<Record<BroadcastRecipientStatus, number>> = { sent: 1, delivered: 2, read: 3 };
const BY_RANK: BroadcastRecipientStatus[] = ['pending', 'sent', 'delivered', 'read'];

/**
 * Applies WhatsApp delivery receipts (sent / delivered / read / failed) to
 * campaign recipients and keeps the campaign's counters in step. Idempotent:
 * Meta retries webhooks, and a receipt that does not move a recipient forward
 * changes nothing.
 */
@Injectable()
export class CampaignTracker {
  private readonly logger = new Logger(CampaignTracker.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleStatuses(tenantId: string, statuses: WebhookStatus[]): Promise<void> {
    for (const s of statuses) {
      try {
        await this.handleOne(tenantId, s);
      } catch (err) {
        // One bad receipt must not block the rest of the webhook batch.
        this.logger.error(`Could not apply status ${s.status} for ${s.id}: ${(err as Error).message}`);
      }
    }
  }

  private async handleOne(tenantId: string, s: WebhookStatus): Promise<void> {
    const recipient = await this.prisma.broadcastRecipient.findUnique({
      where: { waMessageId: s.id },
      select: { id: true, status: true, campaignId: true, campaign: { select: { tenantId: true } } },
    });
    if (!recipient || recipient.campaign.tenantId !== tenantId) return; // not a campaign message

    const at = new Date(Number(s.timestamp) * 1000 || Date.now());

    if (s.status === 'delivered' || s.status === 'read') {
      await this.advance(recipient.id, recipient.campaignId, s.status, at);
    } else if (s.status === 'failed') {
      await this.fail(recipient.id, recipient.campaignId, s);
    }
  }

  private async advance(recipientId: string, campaignId: string, target: 'delivered' | 'read', at: Date): Promise<void> {
    const targetRank = RANK[target]!;
    // Two attempts: the status may change between the read and the conditional write.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.prisma.broadcastRecipient.findUnique({ where: { id: recipientId }, select: { status: true } });
      const currentRank = current ? RANK[current.status] : undefined;
      if (!current || currentRank === undefined || currentRank >= targetRank) return;

      const moved = await this.prisma.broadcastRecipient.updateMany({
        where: { id: recipientId, status: current.status },
        data: {
          status: target,
          ...(target === 'delivered' ? { deliveredAt: at } : { readAt: at, ...(currentRank < 2 ? { deliveredAt: at } : {}) }),
        },
      });
      if (moved.count === 0) continue;

      // Counters are cumulative: "delivered" includes "read".
      const crossed = BY_RANK.slice(currentRank + 1, targetRank + 1);
      await this.prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: {
          ...(crossed.includes('delivered') ? { deliveredCount: { increment: 1 } } : {}),
          ...(crossed.includes('read') ? { readCount: { increment: 1 } } : {}),
        },
      });
      return;
    }
  }

  /** A send that Meta accepted but later failed to deliver. */
  private async fail(recipientId: string, campaignId: string, s: WebhookStatus): Promise<void> {
    const err = (s.errors?.[0] ?? {}) as { code?: number | string; title?: string; message?: string; error_data?: { details?: string } };
    const moved = await this.prisma.broadcastRecipient.updateMany({
      where: { id: recipientId, status: 'sent' }, // once delivered, a "failed" receipt is stale
      data: {
        status: 'failed',
        errorCode: err.code !== undefined ? String(err.code) : 'delivery_failed',
        errorDetail: { message: (err.error_data?.details ?? err.message ?? err.title ?? 'Delivery failed').slice(0, 500) },
      },
    });
    if (moved.count > 0) {
      await this.prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: { sentCount: { decrement: 1 }, failedCount: { increment: 1 } },
      });
    }
  }
}
