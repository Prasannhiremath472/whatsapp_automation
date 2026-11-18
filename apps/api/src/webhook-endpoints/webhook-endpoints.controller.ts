import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  SaveWebhookEndpointRequestSchema,
  type SaveWebhookEndpointRequest,
  type WebhookDeliveryDto,
  type WebhookEndpointDto,
  type WebhookEndpointWithSecretDto,
} from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WebhookEndpointsService } from './webhook-endpoints.service';

@Controller('webhook-endpoints')
@Roles('tenant_admin')
export class WebhookEndpointsController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Get()
  list(@TenantId() tenantId: string): Promise<WebhookEndpointDto[]> {
    return this.endpoints.list(tenantId);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(SaveWebhookEndpointRequestSchema)) body: SaveWebhookEndpointRequest,
  ): Promise<WebhookEndpointWithSecretDto> {
    return this.endpoints.create(tenantId, body);
  }

  @Put(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveWebhookEndpointRequestSchema)) body: SaveWebhookEndpointRequest,
  ): Promise<WebhookEndpointDto> {
    return this.endpoints.update(tenantId, id, body);
  }

  @Post(':id/rotate-secret')
  @HttpCode(200)
  rotate(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<WebhookEndpointWithSecretDto> {
    return this.endpoints.rotateSecret(tenantId, id);
  }

  @Post(':id/test')
  @HttpCode(202)
  async test(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.endpoints.sendTest(tenantId, id);
  }

  @Get(':id/deliveries')
  deliveries(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<WebhookDeliveryDto[]> {
    return this.endpoints.deliveries(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.endpoints.remove(tenantId, id);
  }
}
