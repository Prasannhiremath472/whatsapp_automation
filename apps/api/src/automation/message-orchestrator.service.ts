import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Conversation, Message } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { INBOX_EVENTS } from '../inbox/inbox-events.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEngine } from './automation-engine.service';

interface MessageNewPayload {
  tenantId: string;
  message: Message;
  conversation: Conversation;
}

/**
 * Decides who answers a customer's message. Exactly one of these handles it,
 * in this order:
 *  1. the commerce bot (tenants that enabled it run their own flow),
 *  2. an automation whose trigger matches,
 *  3. the business's AI agent (unless a person has joined the chat),
 *  4. nobody: the message waits in the inbox for the team.
 *
 * It listens on the shared event bus, so removing it never breaks message
 * ingestion.
 */
@Injectable()
export class MessageOrchestrator {
  private readonly logger = new Logger(MessageOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly automations: AutomationEngine,
    private readonly ai: AiService,
  ) {}

  @OnEvent(INBOX_EVENTS.MESSAGE_NEW)
  async handleMessageNew(payload: MessageNewPayload): Promise<void> {
    const { tenantId, message, conversation } = payload;
    if (message.direction !== 'inbound' || message.senderType !== 'customer') return;

    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { commerceBotEnabled: true } });
      if (tenant?.commerceBotEnabled) return;

      const body = (message.content as { body?: unknown } | null)?.body;
      const text = typeof body === 'string' ? body.trim() : '';
      // Opted-out customers never get automated messages.
      const contact = await this.prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { optedOut: true } });
      if (contact?.optedOut) return;

      if (text && (await this.automations.handleInbound(tenantId, conversation, text))) return;
      if (text) await this.ai.handleInbound(tenantId, conversation);
    } catch (err) {
      this.logger.warn(`Could not handle inbound message ${message.id}: ${(err as Error).message}`);
    }
  }
}
