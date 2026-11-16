import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WhatsappConnection } from '@prisma/client';
import { WebhookEventsService } from '../webhook/webhook-events.service';

/**
 * In mock mode Meta never calls our webhook, so campaign stats would stay at
 * "sent" forever. This stores the same status webhooks Meta would send
 * (delivered, then read for most recipients) in the webhook inbox, due a few
 * seconds from now, so the genuine delivery-tracking code path runs. Does
 * nothing in live mode or when MOCK_AUTO_ACK=false.
 */
@Injectable()
export class MockReceiptSimulator {
  constructor(
    private readonly config: ConfigService,
    private readonly events: WebhookEventsService,
  ) {}

  private get enabled(): boolean {
    return (this.config.get<string>('WHATSAPP_MODE') ?? 'mock') !== 'live' && (this.config.get<string>('MOCK_AUTO_ACK') ?? 'true') === 'true';
  }

  simulate(connection: WhatsappConnection, waMessageId: string, toWaId: string): void {
    if (!this.enabled) return;
    const send = (status: 'delivered' | 'read', delayMs: number) =>
      this.events
        .enqueue(
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
          { delayMs },
        )
        .catch(() => undefined); // simulation is best-effort

    send('delivered', 1000 + Math.floor(Math.random() * 2500));
    if (Math.random() < 0.7) send('read', 4000 + Math.floor(Math.random() * 8000));
  }
}
