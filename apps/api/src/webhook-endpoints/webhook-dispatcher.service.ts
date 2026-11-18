import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Conversation, Message, Prisma } from '@prisma/client';
import { describeMessage, type WebhookEventName } from '@whatsapp-crm/shared-types';
import { INBOX_EVENTS } from '../inbox/inbox-events.constants';
import { PrismaService } from '../prisma/prisma.service';

type ConversationWithContact = Conversation & {
  contact?: { id: string; waId: string; displayName: string | null; profileName: string | null } | null;
};

/** Turns inbox activity into queued webhook deliveries for every endpoint subscribed to it. */
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(INBOX_EVENTS.MESSAGE_NEW)
  async onMessage(payload: { tenantId: string; message: Message; conversation: ConversationWithContact | null }): Promise<void> {
    try {
      const { tenantId, message, conversation } = payload;
      const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { tenantId, active: true } });
      if (endpoints.length === 0) return;

      const base = {
        conversation: { id: message.conversationId },
        contact: conversation?.contact
          ? {
              id: conversation.contact.id,
              name: conversation.contact.displayName ?? conversation.contact.profileName,
              phone: `+${conversation.contact.waId}`,
            }
          : null,
      };
      const msg = {
        id: message.id,
        waMessageId: message.waMessageId,
        type: message.messageType,
        text: describeMessage(message.messageType, message.content),
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      };

      const events: { name: WebhookEventName; data: Record<string, unknown> }[] = [];
      if (message.direction === 'inbound') {
        events.push({ name: 'message.received', data: { ...base, message: msg } });
        const inboundCount = await this.prisma.message.count({
          where: { tenantId, conversationId: message.conversationId, direction: 'inbound' },
        });
        if (inboundCount === 1) events.push({ name: 'conversation.created', data: base });
      } else {
        events.push({ name: 'message.status', data: { ...base, message: msg } });
      }

      for (const event of events) {
        for (const endpoint of endpoints) {
          if (!(endpoint.events as unknown as string[]).includes(event.name)) continue;
          await this.prisma.webhookDelivery.create({
            data: {
              endpointId: endpoint.id,
              tenantId,
              event: event.name,
              payload: { event: event.name, createdAt: new Date().toISOString(), data: event.data } as Prisma.InputJsonValue,
            },
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Could not queue webhook deliveries: ${(err as Error).message}`);
    }
  }
}
