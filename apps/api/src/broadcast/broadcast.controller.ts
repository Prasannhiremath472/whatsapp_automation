import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import type { BroadcastCampaign, BroadcastTemplate } from '@prisma/client';
import { CreateBroadcastCampaignRequestSchema, SaveBroadcastTemplateRequestSchema } from '@whatsapp-crm/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BroadcastService } from './broadcast.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Roles('tenant_admin', 'agent')
  @Get('broadcast-templates')
  async listTemplates(@CurrentTenant() tenantId: string | null): Promise<BroadcastTemplate[]> {
    if (!tenantId) throw new ForbiddenException('This account is not associated with a tenant');
    return this.broadcastService.listTemplates(tenantId);
  }

  @Roles('tenant_admin')
  @Post('broadcast-templates')
  async createTemplate(@CurrentTenant() tenantId: string | null, @Body() body: unknown): Promise<BroadcastTemplate> {
    if (!tenantId) throw new ForbiddenException('This account is not associated with a tenant');
    const input = SaveBroadcastTemplateRequestSchema.parse(body);
    return this.broadcastService.createTemplate(tenantId, input);
  }

  @Roles('tenant_admin', 'agent')
  @Get('broadcast-campaigns')
  async listCampaigns(@CurrentTenant() tenantId: string | null): Promise<BroadcastCampaign[]> {
    if (!tenantId) throw new ForbiddenException('This account is not associated with a tenant');
    return this.broadcastService.listCampaigns(tenantId);
  }

  @Roles('tenant_admin')
  @Post('broadcast-campaigns')
  async createCampaign(
    @CurrentTenant() tenantId: string | null,
    @CurrentUser() user: { sub: string },
    @Body() body: unknown,
  ): Promise<BroadcastCampaign> {
    if (!tenantId) throw new ForbiddenException('This account is not associated with a tenant');
    const input = CreateBroadcastCampaignRequestSchema.parse(body);
    return this.broadcastService.createCampaign(tenantId, user.sub, input);
  }
}
