import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  normalizeWaId,
  variableCount,
  type ContactDto,
  type ListContactsQuery,
  type Paginated,
  type PublicSendMessage,
  type PublicUpsertContact,
} from '@whatsapp-crm/shared-types';
import { ContactsService } from '../contacts/contacts.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PublicMessage {
  id: string;
  to: string;
  type: string;
  status: string;
  waMessageId: string | null;
  conversationId: string;
  createdAt: string;
  error: string | null;
}

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly contacts: ContactsService,
  ) {}

  async listTemplates(tenantId: string) {
    const rows = await this.prisma.messageTemplate.findMany({ where: { tenantId, status: 'approved' }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      headerType: t.headerType,
      body: t.body,
      variableCount: variableCount(t.body),
    }));
  }

  listContacts(tenantId: string, query: ListContactsQuery): Promise<Paginated<ContactDto>> {
    return this.contacts.list(tenantId, query);
  }

  /** Creates the contact, or updates it when the number is already saved (tags are added, never removed). */
  async upsertContact(tenantId: string, input: PublicUpsertContact): Promise<{ contact: ContactDto; created: boolean }> {
    const waId = normalizeWaId(input.phone, input.defaultCountryCode);
    if (!waId) throw new BadRequestException('Enter a valid phone number including the country code');
    const existing = await this.prisma.contact.findUnique({ where: { tenantId_waId: { tenantId, waId } } });
    if (!existing) {
      const contact = await this.contacts.create(tenantId, {
        name: input.name ?? `+${waId}`,
        phone: waId,
        ...(input.email ? { email: input.email } : {}),
        ...(input.location ? { location: input.location } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        source: 'API',
      });
      return { contact, created: true };
    }
    const current = await this.contacts.get(tenantId, existing.id);
    const contact = await this.contacts.update(tenantId, existing.id, {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.tags ? { tags: [...new Set([...current.tags, ...input.tags])] } : {}),
    });
    return { contact, created: false };
  }

  async sendMessage(tenantId: string, input: PublicSendMessage): Promise<PublicMessage> {
    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.connectionStatus !== 'connected') {
      throw new ConflictException('No WhatsApp number is connected to this business');
    }
    const waId = normalizeWaId(input.to, input.defaultCountryCode);
    if (!waId) throw new BadRequestException('"to" must be a valid phone number including the country code');

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_waId: { tenantId, waId } },
      update: {},
      create: { tenantId, waId, displayName: `+${waId}`, source: 'API' },
    });
    if (contact.optedOut) throw new UnprocessableEntityException('This contact has opted out of messages');
    const conversation = await this.inbox.findOrCreateOpenConversation(tenantId, contact.id, connection.id);

    let message;
    if (input.type === 'template') {
      const template = await this.prisma.messageTemplate.findFirst({
        where: { tenantId, name: input.template.name, language: input.template.language, status: 'approved' },
      });
      if (!template) throw new NotFoundException(`No approved template "${input.template.name}" in "${input.template.language}"`);
      message = await this.inbox.sendTemplateMessage(tenantId, conversation.id, null, {
        templateId: template.id,
        bodyVars: input.template.variables,
        headerVars: [],
        ...(input.template.headerMediaUrl ? { headerMediaUrl: input.template.headerMediaUrl } : {}),
      });
    } else {
      const windowEnd = await this.inbox.ensureReplyWindow(conversation);
      if (!windowEnd || windowEnd.getTime() < Date.now()) {
        throw new UnprocessableEntityException('The 24-hour reply window is closed. Send an approved template instead.');
      }
      message = await this.inbox.sendBotReply(tenantId, conversation.id, input.text);
    }

    if (message.status === 'failed') {
      const detail = (message.errorDetail as { message?: string } | null)?.message ?? 'WhatsApp rejected the message';
      throw new BadGatewayException(detail);
    }
    return this.toPublic(message, waId, conversation.id);
  }

  async getMessage(tenantId: string, id: string): Promise<PublicMessage> {
    const message = await this.prisma.message.findFirst({ where: { id, tenantId, direction: 'outbound' }, include: { conversation: { include: { contact: true } } } });
    if (!message) throw new NotFoundException('Message not found');
    return this.toPublic(message, message.conversation.contact.waId, message.conversationId);
  }

  private toPublic(
    m: { id: string; messageType: string; status: string; waMessageId: string | null; createdAt: Date; errorDetail: unknown },
    waId: string,
    conversationId: string,
  ): PublicMessage {
    return {
      id: m.id,
      to: `+${waId}`,
      type: m.messageType,
      status: m.status,
      waMessageId: m.waMessageId,
      conversationId,
      createdAt: m.createdAt.toISOString(),
      error: (m.errorDetail as { message?: string } | null)?.message ?? null,
    };
  }
}
