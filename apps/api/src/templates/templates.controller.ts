import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  ListTemplatesQuerySchema,
  SaveTemplateRequestSchema,
  type ListTemplatesQuery,
  type SaveTemplateRequest,
  type TemplateDto,
} from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TemplatesService } from './templates.service';

@Controller('message-templates')
@Roles('tenant_admin', 'agent')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(ListTemplatesQuerySchema)) query: ListTemplatesQuery,
  ): Promise<TemplateDto[]> {
    return this.templates.list(tenantId, query);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TemplateDto> {
    return this.templates.get(tenantId, id);
  }

  @Post()
  @Roles('tenant_admin')
  create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(SaveTemplateRequestSchema)) body: SaveTemplateRequest,
  ): Promise<TemplateDto> {
    return this.templates.create(tenantId, body);
  }

  @Post('sync')
  @HttpCode(200)
  @Roles('tenant_admin')
  sync(@TenantId() tenantId: string): Promise<{ created: number; updated: number; flagged: number }> {
    return this.templates.syncFromMeta(tenantId);
  }

  @Put(':id')
  @Roles('tenant_admin')
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveTemplateRequestSchema)) body: SaveTemplateRequest,
  ): Promise<TemplateDto> {
    return this.templates.update(tenantId, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles('tenant_admin')
  submit(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TemplateDto> {
    return this.templates.submit(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('tenant_admin')
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templates.remove(tenantId, id);
  }
}
