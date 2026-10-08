import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import {
  AssignConversationRequestSchema,
  SendMessageRequestSchema,
  UpdateConversationStatusRequestSchema,
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
  ): Promise<Conversation[]> {
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

    return this.prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: { contact: true },
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

    return this.prisma.message.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit ? Number(limit) : 50,
      skip: offset ? Number(offset) : 0,
    });
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
