import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { WEBHOOK_EVENTS_QUEUE } from '../webhook/webhook-queue.constants';
import type { WebhookPayload } from '../webhook/webhook-payload.types';

interface SimulateInboundMessageBody {
  phoneNumberId: string;
  fromWaId: string;
  fromProfileName?: string;
  text?: string;
  messageType?: 'text' | 'image' | 'document' | 'list_reply' | 'button_reply';
  mediaId?: string;
  caption?: string;
  /** For messageType 'list_reply' | 'button_reply': the row/button id selected. */
  replyId?: string;
  /** For messageType 'list_reply' | 'button_reply': the row/button title selected. */
  replyTitle?: string;
}

interface SimulateStatusUpdateBody {
  phoneNumberId: string;
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipientWaId?: string;
}

/**
 * Dev-only simulation endpoints that let the full webhook pipeline
 * (queue -> processor -> router -> inbox) be exercised locally without real
 * Meta credentials. Hard-disabled outside development at the module level
 * (see DevModule) — NOT just left unregistered by convention, but guarded
 * so an accidental import can't expose it.
 */
@Controller('dev')
export class DevController {
  constructor(@InjectQueue(WEBHOOK_EVENTS_QUEUE) private readonly queue: Queue) {}

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev simulation endpoints are disabled in production');
    }
  }

  @Public()
  @Post('simulate-inbound-message')
  @HttpCode(202)
  async simulateInboundMessage(@Body() body: SimulateInboundMessageBody): Promise<{ queued: true }> {
    this.assertNotProduction();

    if (!body?.phoneNumberId || !body?.fromWaId) {
      throw new BadRequestException('phoneNumberId and fromWaId are required');
    }

    const messageType = body.messageType ?? 'text';
    const waMessageId = `wamid.sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = String(Math.floor(Date.now() / 1000));

    const messagePayload: Record<string, unknown> = {
      from: body.fromWaId,
      id: waMessageId,
      timestamp,
    };

    if (messageType === 'text') {
      messagePayload.type = 'text';
      messagePayload.text = { body: body.text ?? '' };
    } else if (messageType === 'image') {
      messagePayload.type = 'image';
      messagePayload.image = { id: body.mediaId ?? 'sim-media-id', caption: body.caption };
    } else if (messageType === 'document') {
      messagePayload.type = 'document';
      messagePayload.document = { id: body.mediaId ?? 'sim-media-id', caption: body.caption };
    } else if (messageType === 'list_reply') {
      messagePayload.type = 'interactive';
      messagePayload.interactive = {
        type: 'list_reply',
        list_reply: { id: body.replyId ?? '', title: body.replyTitle ?? '' },
      };
    } else if (messageType === 'button_reply') {
      messagePayload.type = 'interactive';
      messagePayload.interactive = {
        type: 'button_reply',
        button_reply: { id: body.replyId ?? '', title: body.replyTitle ?? '' },
      };
    }

    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'sim-waba-id',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: body.phoneNumberId, phone_number_id: body.phoneNumberId },
                contacts: [{ profile: { name: body.fromProfileName }, wa_id: body.fromWaId }],
                messages: [messagePayload as never],
              },
            },
          ],
        },
      ],
    };

    // Enqueue onto the SAME queue the real POST /webhook uses, so this is a
    // true end-to-end exercise of the pipeline rather than a shortcut that
    // calls processing logic directly.
    await this.queue.add('inbound-webhook-event', payload, { removeOnComplete: true, removeOnFail: 100 });

    return { queued: true };
  }

  @Public()
  @Post('simulate-status-update')
  @HttpCode(202)
  async simulateStatusUpdate(@Body() body: SimulateStatusUpdateBody): Promise<{ queued: true }> {
    this.assertNotProduction();

    if (!body?.phoneNumberId || !body?.waMessageId || !body?.status) {
      throw new BadRequestException('phoneNumberId, waMessageId and status are required');
    }

    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'sim-waba-id',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: body.phoneNumberId },
                statuses: [
                  {
                    id: body.waMessageId,
                    status: body.status,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: body.recipientWaId ?? 'unknown',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await this.queue.add('inbound-webhook-event', payload, { removeOnComplete: true, removeOnFail: 100 });

    return { queued: true };
  }
}
