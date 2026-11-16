import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  AudiencePreviewRequestSchema,
  ListCampaignsQuerySchema,
  ListRecipientsQuerySchema,
  SaveCampaignRequestSchema,
  type AudiencePreview,
  type AudiencePreviewRequest,
  type CampaignDto,
  type CampaignRecipientDto,
  type ListCampaignsQuery,
  type ListRecipientsQuery,
  type Paginated,
  type SaveCampaignRequest,
} from '@whatsapp-crm/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';

/** Agents can follow campaign progress; only tenant admins can create or control them. */
@Controller('campaigns')
@Roles('tenant_admin', 'agent')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListCampaignsQuerySchema)) query: ListCampaignsQuery,
  ): Promise<Paginated<CampaignDto>> {
    return this.campaigns.list(tenantId, query);
  }

  @Get('summary')
  summary(@TenantId() tenantId: string) {
    return this.campaigns.summary(tenantId);
  }

  @Post('audience-preview')
  @HttpCode(200)
  @Roles('tenant_admin')
  previewAudience(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(AudiencePreviewRequestSchema)) body: AudiencePreviewRequest,
  ): Promise<AudiencePreview> {
    return this.campaigns.previewAudience(tenantId, body.audience);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.get(tenantId, id);
  }

  @Get(':id/recipients')
  recipients(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListRecipientsQuerySchema)) query: ListRecipientsQuery,
  ): Promise<Paginated<CampaignRecipientDto>> {
    return this.campaigns.listRecipients(tenantId, id, query);
  }

  @Post()
  @Roles('tenant_admin')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(SaveCampaignRequestSchema)) body: SaveCampaignRequest,
  ): Promise<CampaignDto> {
    return this.campaigns.create(tenantId, user.sub, body);
  }

  @Put(':id')
  @Roles('tenant_admin')
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveCampaignRequestSchema)) body: SaveCampaignRequest,
  ): Promise<CampaignDto> {
    return this.campaigns.update(tenantId, id, body);
  }

  @Post(':id/launch')
  @HttpCode(200)
  @Roles('tenant_admin')
  launch(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.launch(tenantId, id);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @Roles('tenant_admin')
  pause(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.pause(tenantId, id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @Roles('tenant_admin')
  resume(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.resume(tenantId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('tenant_admin')
  cancel(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.cancel(tenantId, id);
  }

  @Post(':id/retry-failed')
  @HttpCode(200)
  @Roles('tenant_admin')
  retryFailed(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.retryFailed(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('tenant_admin')
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.campaigns.remove(tenantId, id);
  }
}
