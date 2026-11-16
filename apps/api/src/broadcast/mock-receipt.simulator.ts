import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { WhatsappConnection } from '@prisma/client';
import { WEBHOOK_EVENTS_QUEUE } from '../webhook/webhook-queue.constants';

/**
 * In mock mode Meta never calls our webhook, so campaign stats would stay at
 * "sent" forever. This enqueues the same status webhooks Meta would send
 * (delivered, then read for most recipients) onto the real webhook queue, so
 * the genuine delivery-tracking code path runs. Does nothing in live mode or
 * when MOCK_AUTO_ACK=false.
 */
@Injectable()
export class MockReceiptSimulator {
  constructor(
    private readonly config: ConfigService,
    @InjectQueue(WEBHOOK_EVENTS_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  private get enabled(): boolean {
    return (this.config.get<string>('WHATSAPP_MODE') ?? 'mock') !== 'live' && (this.config.get<string>('MOCK_AUTO_ACK') ?? 'true') === 'true';
  }

  simulate(connection: WhatsappConnection, waMessageId: string, toWaId: string): void {
    if (!this.enabled) return;
    const send = (status: 'delivered' | 'read', delayMs: number) =>
      this.webhookQueue
        .add(
          'mock-receipt',
          {
            object: 'whatsapp_business_account',
            entry: [
              {
                id: connection.wabaId ?? 'mock-waba',
                changes: [
                  {
                    field: 'messages',
                    value: {
                      messaging_product: 'whatsapp',
                      metadata: { phone_number_id: connection.phoneNumberId },
                      statuses: [{ id: waMessageId, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: toWaId }],
                    },
                  },
                ],
              },
            ],
          },
          { delay: delayMs, removeOnComplete: true, removeOnFail: 50 },
        )
        .catch(() => undefined); // simulation is best-effort

    send('delivered', 1000 + Math.floor(Math.random() * 2500));
    if (Math.random() < 0.7) send('read', 4000 + Math.floor(Math.random() * 8000));
  }
}
