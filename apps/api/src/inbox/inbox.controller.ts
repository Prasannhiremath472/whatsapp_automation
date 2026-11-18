import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import {
  AssignConversationRequestSchema,
  SendMessageRequestSchema,
  SendTemplateMessageRequestSchema,
  SetConversationAiRequestSchema,
  UpdateConversationStatusRequestSchema,
  describeMessage,
} from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InboxService } from './inbox.service';

/**
 * Conversation + message endpoints. tenantId always comes from
 * @CurrentTenant() — never from a route/query param — same pattern as
 * UsersController. Conversation lookups are scoped to the caller's tenant
 * and return 404 (not 403) for cross-tenant ids to avoid leaking existence.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: InboxService,
  ) {}

  @Roles('tenant_admin', 'agent')
  @Get()
  async listConversations(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: { sub: string },
    @Query('assignedToMe') assignedToMe?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }

    const where: Record<string, unknown> = { tenantId };
    if (assignedToMe === 'true') {
      where.assignedAgentId = user.sub;
    }
    if (status === 'open' || status === 'pending' || status === 'closed') {
      where.status = status;
    }
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200);

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take,
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
        assignedAgent: { select: { id: true, displayName: true } },
      },
    });

    // The preview line of each conversation: one indexed lookup per row (at most `take`).
    const latest = await Promise.all(
      rows.map((c) =>
        this.prisma.message.findFirst({
          where: { tenantId, conversationId: c.id },
          orderBy: { createdAt: 'desc' },
          select: { direction: true, messageType: true, content: true, status: true, createdAt: true },
        }),
      ),
    );

    const windows = await Promise.all(rows.map((c) => this.inboxService.ensureReplyWindow(c)));

    return rows.map((c, i) => {
      const m = latest[i];
      return {
        ...c,
        windowExpiresAt: windows[i],
        contactTags: c.contact.tags.map((t) => t.tag.name),
        lastMessage: m
          ? {
              direction: m.direction,
              messageType: m.messageType,
              preview: describeMessage(m.messageType, m.content),
              status: m.status,
              createdAt: m.createdAt,
            }
          : null,
      };
    });
  }

  @Roles('tenant_admin', 'agent')
  @Get(':id/messages')
  async listMessages(
    @CurrentTenant() tenantId: string | null,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Message[]> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }

    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.tenantId !== tenantId) {
      // Same-tenant-only enforcement, mirroring UsersService.updateInTenant —
      // 404 rather than 403 to avoid confirming the id exists in another tenant.
      throw new NotFoundException('Conversation not found');
    }

    const rows = await this.prisma.message.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit ? Math.min(Number(limit), 200) : 50,
      skip: offset ? Number(offset) : 0,
    });
    // `text` is the plain-text rendering of `content`, so clients don't each re-implement it.
    return rows.map((m) => ({ ...m, text: describeMessage(m.messageType, m.content) })) as unknown as Message[];
  }

  @Roles('tenant_admin', 'agent')
  @Post(':id/messages')
  async sendMessage(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: { sub: string },
    @Param('id') conversationId: string,
    @Body() body: unknown,
  ): Promise<Message> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    const input = SendMessageRequestSchema.parse(body);
    return this.inboxService.sendOutboundMessage(tenantId, conversationId, user.sub, input);
  }

  @Roles('tenant_admin', 'agent')
  @Post(':id/template-messages')
  async sendTemplateMessage(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: { sub: string },
    @Param('id') conversationId: string,
    @Body() body: unknown,
  ): Promise<Message> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    const input = SendTemplateMessageRequestSchema.parse(body);
    return this.inboxService.sendTemplateMessage(tenantId, conversationId, user.sub, input);
  }

  @Roles('tenant_admin', 'agent')
  @Patch(':id/ai')
  async setAi(
    @CurrentTenant() tenantId: string | null,
    @Param('id') conversationId: string,
    @Body() body: unknown,
  ): Promise<Conversation> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    const input = SetConversationAiRequestSchema.parse(body);
    return this.inboxService.setAiPaused(tenantId, conversationId, input.paused);
  }

  @Roles('tenant_admin', 'agent')
  @Post(':id/read')
  @HttpCode(200)
  async markRead(@CurrentTenant() tenantId: string | null, @Param('id') conversationId: string): Promise<Conversation> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    return this.inboxService.markRead(tenantId, conversationId);
  }

  @Roles('tenant_admin', 'agent')
  @Patch(':id/assign')
  async assignConversation(
    @CurrentTenant() tenantId: string | null,
    @Param('id') conversationId: string,
    @Body() body: unknown,
  ): Promise<Conversation> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    const input = AssignConversationRequestSchema.parse(body);
    return this.inboxService.assignConversation(tenantId, conversationId, input.agentUserId);
  }

  @Roles('tenant_admin', 'agent')
  @Patch(':id/status')
  async updateStatus(
    @CurrentTenant() tenantId: string | null,
    @Param('id') conversationId: string,
    @Body() body: unknown,
  ): Promise<Conversation> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    const input = UpdateConversationStatusRequestSchema.parse(body);
    return this.inboxService.updateConversationStatus(tenantId, conversationId, input.status);
  }
}
