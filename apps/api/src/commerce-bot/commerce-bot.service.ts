import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { BotSession, Conversation, Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { INBOX_EVENTS } from '../inbox/inbox-events.constants';
import { CommerceBotFlowEngine } from './commerce-bot-flow.engine';

interface MessageNewPayload {
  tenantId: string;
  message: Message;
  conversation: Conversation;
}

/** Sessions inactive longer than this are soft-reset to START on next contact. */
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Entry point for the commerce bot: listens on the same EventEmitter2 bus
 * InboxGateway/AutomationService use, gated by Tenant.commerceBotEnabled so
 * tenants without a machine catalog (e.g. the school demo tenant) are
 * entirely unaffected.
 */
@Injectable()
export class CommerceBotService {
  private readonly logger = new Logger(CommerceBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowEngine: CommerceBotFlowEngine,
  ) {}

  @OnEvent(INBOX_EVENTS.MESSAGE_NEW)
  async handleMessageNew(payload: MessageNewPayload): Promise<void> {
    const { tenantId, message, conversation } = payload;
    if (message.direction !== 'inbound' || message.senderType !== 'customer') return;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.commerceBotEnabled) return;

    const session = await this.loadOrCreateSession(tenantId, conversation);
    await this.flowEngine.handleInboundMessage(tenant, session, message, conversation);
  }

  private async loadOrCreateSession(tenantId: string, conversation: Conversation): Promise<BotSession> {
    const existing = await this.prisma.botSession.findUnique({ where: { conversationId: conversation.id } });
    if (!existing) {
      return this.prisma.botSession.create({
        data: { tenantId, conversationId: conversation.id, contactId: conversation.contactId, currentStep: 'START' },
      });
    }

    const isExpired = Date.now() - existing.lastInteractionAt.getTime() > SESSION_EXPIRY_MS;
    if (isExpired) {
      this.logger.log(`Session ${existing.id} expired (24h+ inactive); resetting to START`);
      return this.prisma.botSession.update({
        where: { id: existing.id },
        data: { currentStep: 'START', contextData: {}, draftOrderId: null },
      });
    }

    return existing;
  }
}
