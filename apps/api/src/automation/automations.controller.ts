import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  SaveAutomationRequestSchema,
  SetAutomationStatusRequestSchema,
  type AutomationDto,
  type AutomationRunDto,
  type SaveAutomationRequest,
} from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AutomationsService } from './automations.service';

@Controller('automations')
@Roles('tenant_admin', 'agent')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@TenantId() tenantId: string): Promise<AutomationDto[]> {
    return this.automations.list(tenantId);
  }

  @Post()
  @Roles('tenant_admin')
  create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(SaveAutomationRequestSchema)) body: SaveAutomationRequest,
  ): Promise<AutomationDto> {
    return this.automations.create(tenantId, body);
  }

  @Put(':id')
  @Roles('tenant_admin')
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveAutomationRequestSchema)) body: SaveAutomationRequest,
  ): Promise<AutomationDto> {
    return this.automations.update(tenantId, id, body);
  }

  @Patch(':id/status')
  @Roles('tenant_admin')
  setStatus(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetAutomationStatusRequestSchema)) body: { status: 'active' | 'paused' },
  ): Promise<AutomationDto> {
    return this.automations.setStatus(tenantId, id, body.status);
  }

  @Get(':id/runs')
  runs(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<AutomationRunDto[]> {
    return this.automations.recentRuns(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('tenant_admin')
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.automations.remove(tenantId, id);
  }
}
