import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { SupportTicket } from '@prisma/client';
import type { CreateTicketRequest, TicketDetailDto, TicketDto, TicketStatus } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private toDto(t: SupportTicket, names: Map<string, string>): TicketDto {
    return {
      id: t.id,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      createdByName: names.get(t.createdByUserId) ?? 'Unknown',
      createdAt: t.createdAt.toISOString(),
      lastMessageAt: t.lastMessageAt.toISOString(),
    };
  }

  async list(tenantId: string, status?: TicketStatus): Promise<TicketDto[]> {
    const rows = await this.prisma.supportTicket.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    const names = await this.names(rows.map((r) => r.createdByUserId));
    return rows.map((r) => this.toDto(r, names));
  }

  private async findOwned(tenantId: string, id: string): Promise<SupportTicket> {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, tenantId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async get(tenantId: string, id: string): Promise<TicketDetailDto> {
    const ticket = await this.findOwned(tenantId, id);
    const messages = await this.prisma.supportTicketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } });
    const names = await this.names([ticket.createdByUserId, ...messages.map((m) => m.authorUserId)]);
    return {
      ...this.toDto(ticket, names),
      messages: messages.map((m) => ({
        id: m.id,
        authorType: m.authorType as 'customer' | 'support',
        authorName: m.authorType === 'support' ? 'Genie Support' : (names.get(m.authorUserId ?? '') ?? 'You'),
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async create(tenantId: string, userId: string, input: CreateTicketRequest): Promise<TicketDetailDto> {
    const open = await this.prisma.supportTicket.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } });
    if (open >= 20) throw new ConflictException('You have 20 open tickets. Please wait for replies or close some before opening more.');
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId,
        createdByUserId: userId,
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        messages: { create: { authorUserId: userId, authorType: 'customer', body: input.message } },
      },
    });
    return this.get(tenantId, ticket.id);
  }

  /** A reply from the business. Replying to a resolved or closed ticket reopens it. */
  async reply(tenantId: string, userId: string, id: string, message: string): Promise<TicketDetailDto> {
    const ticket = await this.findOwned(tenantId, id);
    await this.prisma.supportTicketMessage.create({ data: { ticketId: id, authorUserId: userId, authorType: 'customer', body: message } });
    await this.prisma.supportTicket.update({
      where: { id },
      data: { lastMessageAt: new Date(), status: ticket.status === 'resolved' || ticket.status === 'closed' ? 'open' : ticket.status },
    });
    return this.get(tenantId, id);
  }

  async close(tenantId: string, id: string): Promise<TicketDetailDto> {
    await this.findOwned(tenantId, id);
    await this.prisma.supportTicket.update({ where: { id }, data: { status: 'closed' } });
    return this.get(tenantId, id);
  }
}
