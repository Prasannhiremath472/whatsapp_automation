import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Conversation, Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';
import { INBOX_EVENTS } from '../inbox/inbox-events.constants';
import { matchAutoReply } from './autoreply-rules';

interface MessageNewPayload {
  tenantId: string;
  message: Message;
  conversation: Conversation;
}

/**
 * Auto-replies to every inbound customer message, regardless of assignment
 * status. A counselor can still jump in and reply manually at any time —
 * both bot and human messages land in the same thread.
 *
 * Listens on the same EventEmitter2 bus InboxGateway uses (see
 * inbox-events.constants.ts) rather than being called directly from
 * InboxService, so this stays an optional, decoupled add-on: removing this
 * module doesn't break message ingestion.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: InboxService,
  ) {}

  @OnEvent(INBOX_EVENTS.MESSAGE_NEW)
  async handleMessageNew(payload: MessageNewPayload): Promise<void> {
    const { tenantId, message, conversation } = payload;

    if (message.direction !== 'inbound' || message.senderType !== 'customer') {
      return;
    }

    // Tenants with the commerce bot enabled run their own guided flow
    // (CommerceBotService) instead of this keyword auto-reply — never let
    // both reply to the same inbound message.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant?.commerceBotEnabled) {
      return;
    }

    const text = typeof (message.content as { body?: unknown })?.body === 'string'
      ? ((message.content as { body: string }).body)
      : '';
    if (!text.trim()) {
      return;
    }

    const reply = matchAutoReply(text);

    try {
      await this.inboxService.sendBotReply(tenantId, conversation.id, reply);
      this.logger.log(`Auto-replied to conversationId=${conversation.id}`);
    } catch (err) {
      this.logger.warn(`Auto-reply failed conversationId=${conversation.id}: ${(err as Error).message}`);
    }
  }
}
