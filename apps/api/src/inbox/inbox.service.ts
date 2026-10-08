import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Conversation, Message, MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { WebhookChangeValue, WebhookInboundMessage, WebhookStatus } from '../webhook/webhook-payload.types';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp-connections/whatsapp-provider.interface';
import type { SendMessageRequest } from '@whatsapp-crm/shared-types';
import { INBOX_EVENTS } from './inbox-events.constants';

function mapMessageTypeAndContent(msg: WebhookInboundMessage): { messageType: MessageType; content: Record<string, unknown> } {
  switch (msg.type) {
    case 'text':
      return { messageType: 'text', content: { body: msg.text?.body ?? '' } };
    case 'image':
      return {
        messageType: 'image',
        content: {
          mediaId: msg.image?.id,
          caption: msg.image?.caption,
          mimeType: msg.image?.mime_type,
        },
      };
    case 'document':
      return {
        messageType: 'document',
        content: {
          mediaId: msg.document?.id,
          caption: msg.document?.caption,
          filename: msg.document?.filename,
          mimeType: msg.document?.mime_type,
        },
      };
    case 'audio':
      return { messageType: 'audio', content: { mediaId: msg.audio?.id, mimeType: msg.audio?.mime_type } };
    case 'video':
      return {
        messageType: 'video',
        content: { mediaId: msg.video?.id, caption: msg.video?.caption, mimeType: msg.video?.mime_type },
      };
    case 'interactive': {
      const listReply = msg.interactive?.list_reply;
      if (listReply) {
        return {
          messageType: 'interactive_list',
          content: { replyType: 'list_reply', id: listReply.id, title: listReply.title, description: listReply.description },
        };
      }
      const buttonReply = msg.interactive?.button_reply;
      return {
        messageType: 'interactive_button',
        content: {
          replyType: 'button_reply',
          id: buttonReply?.id,
          title: buttonReply?.title ?? '',
          // Legacy field names kept alongside id/title so any existing
          // consumer reading buttonText/buttonPayload keeps working.
          buttonText: buttonReply?.title ?? '',
          buttonPayload: buttonReply?.id,
        },
      };
    }
    default:
      // Unknown/unsupported message type — store as text with a raw dump so
      // nothing is silently lost.
      return { messageType: 'text', content: { body: `[unsupported message type: ${msg.type}]`, raw: msg } };
  }
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsappProvider: WhatsAppProvider,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Parses a Meta-shaped `value` (entry[].changes[].value) containing
   * inbound messages + contacts, upserts the Contact, finds-or-creates an
   * open Conversation, and inserts inbound Message rows. tenantId/
   * connectionId come from RouterService.resolveTenantByPhoneNumberId —
   * never from the payload itself.
   */
  async ingestInboundMessage(tenantId: string, connectionId: string, value: WebhookChangeValue): Promise<void> {
    const messages = value.messages ?? [];
    if (messages.length === 0) {
      return;
    }

    const contactsByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c]));

    for (const msg of messages) {
      const waId = msg.from;
      const profile = contactsByWaId.get(waId);

      const contact = await this.prisma.contact.upsert({
        where: { tenantId_waId: { tenantId, waId } },
        update: {
          ...(profile?.profile?.name ? { profileName: profile.profile.name } : {}),
        },
        create: {
          tenantId,
          waId,
          profileName: profile?.profile?.name,
        },
      });

      const conversation = await this.findOrCreateOpenConversation(tenantId, contact.id, connectionId);

      const { messageType, content } = mapMessageTypeAndContent(msg);

      const message = await this.prisma.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: 'inbound',
          senderType: 'customer',
          waMessageId: msg.id,
          messageType,
          content: content as object,
          status: 'delivered',
        },
      });

      const updatedConversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(Number(msg.timestamp) * 1000 || Date.now()),
          unreadCount: { increment: 1 },
        },
        include: { contact: true },
      });

      this.logger.log(`Ingested inbound message waMessageId=${msg.id} tenantId=${tenantId} conversationId=${conversation.id}`);

      this.events.emit(INBOX_EVENTS.MESSAGE_NEW, { tenantId, message, conversation: updatedConversation });
    }
  }

  private async findOrCreateOpenConversation(
    tenantId: string,
    contactId: string,
    connectionId: string,
  ): Promise<Conversation> {
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId, whatsappConnectionId: connectionId, status: { not: 'closed' } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        tenantId,
        contactId,
        whatsappConnectionId: connectionId,
        status: 'open',
      },
    });
  }

  /**
   * Handles Meta's delivery-status callbacks (sent/delivered/read/failed)
   * by updating the matching Message row's status via waMessageId.
   */
  async ingestStatusUpdate(tenantId: string, statuses: WebhookStatus[]): Promise<void> {
    for (const status of statuses) {
      const message = await this.prisma.message.findUnique({ where: { waMessageId: status.id } });
      if (!message || message.tenantId !== tenantId) {
        this.logger.warn(
          `Status update for unknown/mismatched waMessageId="${status.id}" tenantId=${tenantId}; dropping`,
        );
        continue;
      }

      const mappedStatus = ['queued', 'sent', 'delivered', 'read', 'failed'].includes(status.status)
        ? (status.status as Message['status'])
        : message.status;

      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: mappedStatus,
          ...(status.status === 'failed' && status.errors ? { errorDetail: status.errors as object } : {}),
        },
      });

      this.logger.log(`Updated message status waMessageId=${status.id} -> ${mappedStatus}`);

      this.events.emit(INBOX_EVENTS.MESSAGE_NEW, {
        tenantId,
        message: updated,
        conversation: await this.prisma.conversation.findUnique({
          where: { id: updated.conversationId },
          include: { contact: true },
        }),
      });
    }
  }

  /**
   * Looks up a conversation scoped to tenantId, throwing NotFoundException
   * (never ForbiddenException) if it doesn't exist or belongs to another
   * tenant — same "404 not 403" pattern as InboxController.listMessages /
   * UsersService.updateInTenant, to avoid confirming cross-tenant existence.
   */
  async findConversationOrThrow(tenantId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.tenantId !== tenantId) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  /**
   * Sends an outbound message from an agent/tenant_admin. Creates the
   * Message row first (status: queued), then calls the injected
   * WhatsAppProvider. A provider failure is caught and reflected as
   * status: failed + errorDetail rather than throwing — the HTTP request
   * still returns the (failed) message rather than a 500, since the send
   * attempt itself succeeded at the application layer.
   */
  async sendOutboundMessage(
    tenantId: string,
    conversationId: string,
    senderUserId: string,
    input: SendMessageRequest,
  ): Promise<Message> {
    const conversation = await this.findConversationOrThrow(tenantId, conversationId);

    const [contact, connection] = await Promise.all([
      this.prisma.contact.findUnique({ where: { id: conversation.contactId } }),
      this.prisma.whatsappConnection.findUnique({ where: { id: conversation.whatsappConnectionId } }),
    ]);
    if (!contact || !connection) {
      throw new BadRequestException('Conversation is missing its contact or WhatsApp connection');
    }

    const { messageType, content } = ((): { messageType: MessageType; content: Record<string, unknown> } => {
      switch (input.messageType) {
        case 'text':
          return { messageType: 'text', content: { body: input.text } };
        case 'image':
          return { messageType: 'image', content: { mediaId: input.mediaId, caption: input.caption } };
        case 'document':
          return {
            messageType: 'document',
            content: { mediaId: input.mediaId, caption: input.caption, filename: input.filename },
          };
        default: {
          const _exhaustive: never = input;
          throw new BadRequestException(`Unsupported messageType: ${JSON.stringify(_exhaustive)}`);
        }
      }
    })();

    let message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'agent',
        senderUserId,
        messageType,
        content: content as object,
        status: 'queued',
      },
    });

    try {
      // Only text send is wired to a real provider call for M3; image/
      // document are accepted and persisted (per the milestone spec) but
      // don't attempt a real media send yet.
      if (input.messageType === 'text') {
        const { waMessageId } = await this.whatsappProvider.sendTextMessage(connection, contact.waId, input.text);
        message = await this.prisma.message.update({
          where: { id: message.id },
          data: { waMessageId, status: 'sent' },
        });
      } else {
        message = await this.prisma.message.update({
          where: { id: message.id },
          data: { status: 'sent' },
        });
      }
    } catch (err) {
      const errorDetail = { message: err instanceof Error ? err.message : String(err) };
      message = await this.prisma.message.update({
        where: { id: message.id },
        data: { status: 'failed', errorDetail },
      });
      this.logger.warn(`Outbound send failed conversationId=${conversationId}: ${errorDetail.message}`);
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
      include: { contact: true },
    });

    this.events.emit(INBOX_EVENTS.MESSAGE_NEW, { tenantId, message, conversation: updatedConversation });

    return message;
  }

  /**
   * Sends an automated bot reply into a conversation. Mirrors
   * sendOutboundMessage's persist-then-send-then-reconcile-status shape, but
   * senderType is 'bot' and there's no senderUserId — callers (e.g.
   * AutomationService) only ever pass plain text.
   */
  async sendBotReply(tenantId: string, conversationId: string, text: string): Promise<Message> {
    const conversation = await this.findConversationOrThrow(tenantId, conversationId);

    const [contact, connection] = await Promise.all([
      this.prisma.contact.findUnique({ where: { id: conversation.contactId } }),
      this.prisma.whatsappConnection.findUnique({ where: { id: conversation.whatsappConnectionId } }),
    ]);
    if (!contact || !connection) {
      throw new BadRequestException('Conversation is missing its contact or WhatsApp connection');
    }

    let message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'bot',
        messageType: 'text',
        content: { body: text },
        status: 'queued',
      },
    });

    try {
      const { waMessageId } = await this.whatsappProvider.sendTextMessage(connection, contact.waId, text);
      message = await this.prisma.message.update({
        where: { id: message.id },
        data: { waMessageId, status: 'sent' },
      });
    } catch (err) {
      const errorDetail = { message: err instanceof Error ? err.message : String(err) };
      message = await this.prisma.message.update({
        where: { id: message.id },
        data: { status: 'failed', errorDetail },
      });
      this.logger.warn(`Bot reply send failed conversationId=${conversationId}: ${errorDetail.message}`);
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
      include: { contact: true },
    });

    this.events.emit(INBOX_EVENTS.MESSAGE_NEW, { tenantId, message, conversation: updatedConversation });

    return message;
  }

  /**
   * Sends a WhatsApp interactive List Message as a bot reply. Mirrors
   * sendBotReply's persist-then-send-then-reconcile-status shape; used by
   * CommerceBotFlowEngine to present menus (up to 10 rows per WhatsApp's
   * limit — not enforced here, caller's responsibility).
   */
  async sendBotListMessage(
    tenantId: string,
    conversationId: string,
    params: Parameters<WhatsAppProvider['sendListMessage']>[2],
  ): Promise<Message> {
    const conversation = await this.findConversationOrThrow(tenantId, conversationId);
    const [contact, connection] = await Promise.all([
      this.prisma.contact.findUnique({ where: { id: conversation.contactId } }),
      this.prisma.whatsappConnection.findUnique({ where: { id: conversation.whatsappConnectionId } }),
    ]);
    if (!contact || !connection) {
      throw new BadRequestException('Conversation is missing its contact or WhatsApp connection');
    }

    let message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'bot',
        messageType: 'interactive_list',
        content: {
          headerText: params.headerText,
          bodyText: params.bodyText,
          footerText: params.footerText,
          buttonLabel: params.buttonLabel,
          sections: params.sections,
        } as object,
        status: 'queued',
      },
    });

    try {
      const { waMessageId } = await this.whatsappProvider.sendListMessage(connection, contact.waId, params);
      message = await this.prisma.message.update({ where: { id: message.id }, data: { waMessageId, status: 'sent' } });
    } catch (err) {
      const errorDetail = { message: err instanceof Error ? err.message : String(err) };
      message = await this.prisma.message.update({ where: { id: message.id }, data: { status: 'failed', errorDetail } });
      this.logger.warn(`Bot list send failed conversationId=${conversationId}: ${errorDetail.message}`);
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
      include: { contact: true },
    });
    this.events.emit(INBOX_EVENTS.MESSAGE_NEW, { tenantId, message, conversation: updatedConversation });
    return message;
  }

  /**
   * Sends a WhatsApp interactive Reply Buttons message (max 3) as a bot
   * reply. Same shape as sendBotListMessage.
   */
  async sendBotButtonMessage(
    tenantId: string,
    conversationId: string,
    params: Parameters<WhatsAppProvider['sendButtonMessage']>[2],
  ): Promise<Message> {
    const conversation = await this.findConversationOrThrow(tenantId, conversationId);
    const [contact, connection] = await Promise.all([
      this.prisma.contact.findUnique({ where: { id: conversation.contactId } }),
      this.prisma.whatsappConnection.findUnique({ where: { id: conversation.whatsappConnectionId } }),
    ]);
    if (!contact || !connection) {
      throw new BadRequestException('Conversation is missing its contact or WhatsApp connection');
    }

    let message = await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'bot',
        messageType: 'interactive_button',
        content: { bodyText: params.bodyText, footerText: params.footerText, buttons: params.buttons } as object,
        status: 'queued',
      },
    });

    try {
      const { waMessageId } = await this.whatsappProvider.sendButtonMessage(connection, contact.waId, params);
      message = await this.prisma.message.update({ where: { id: message.id }, data: { waMessageId, status: 'sent' } });
    } catch (err) {
      const errorDetail = { message: err instanceof Error ? err.message : String(err) };
      message = await this.prisma.message.update({ where: { id: message.id }, data: { status: 'failed', errorDetail } });
      this.logger.warn(`Bot button send failed conversationId=${conversationId}: ${errorDetail.message}`);
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
      include: { contact: true },
    });
    this.events.emit(INBOX_EVENTS.MESSAGE_NEW, { tenantId, message, conversation: updatedConversation });
    return message;
  }

  /**
   * Assigns (or unassigns, when agentUserId is null) a conversation to a
   * user. Caller must validate the target user belongs to the same tenant
   * and has an eligible role — done in the controller/service boundary here
   * so it's covered by the same tenant-scoping tests as everything else.
   */
  async assignConversation(tenantId: string, conversationId: string, agentUserId: string | null): Promise<Conversation> {
    await this.findConversationOrThrow(tenantId, conversationId);

    if (agentUserId) {
      const targetUser = await this.prisma.user.findUnique({ where: { id: agentUserId } });
      if (!targetUser || targetUser.tenantId !== tenantId || !['agent', 'tenant_admin'].includes(targetUser.role)) {
        throw new BadRequestException('agentUserId must be an agent or tenant_admin in the same tenant');
      }
    }

    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedAgentId: agentUserId },
      include: { contact: true },
    });

    this.events.emit(INBOX_EVENTS.CONVERSATION_UPDATED, { tenantId, conversation });

    return conversation;
  }

  async updateConversationStatus(
    tenantId: string,
    conversationId: string,
    status: Conversation['status'],
  ): Promise<Conversation> {
    await this.findConversationOrThrow(tenantId, conversationId);

    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status },
      include: { contact: true },
    });

    this.events.emit(INBOX_EVENTS.CONVERSATION_UPDATED, { tenantId, conversation });

    return conversation;
  }
}
