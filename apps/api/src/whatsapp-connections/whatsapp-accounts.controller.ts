import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import {
  ConnectWhatsappAccountRequestSchema,
  UpdateWhatsappAccountRequestSchema,
  type ConnectWhatsappAccountRequest,
  type UpdateWhatsappAccountRequest,
  type WhatsappAccountDto,
} from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WhatsappConnectionsService, toWhatsappAccountDto } from './whatsapp-connections.service';

/** REST surface for the "WhatsApp Accounts" page. Tokens are write-only. */
@Controller('whatsapp-accounts')
@Roles('tenant_admin')
export class WhatsappAccountsController {
  constructor(private readonly connections: WhatsappConnectionsService) {}

  @Get()
  @Roles('tenant_admin', 'agent')
  list(@TenantId() tenantId: string): Promise<WhatsappAccountDto[]> {
    return this.connections.listAccounts(tenantId);
  }

  @Post('connect')
  @HttpCode(200)
  connect(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(ConnectWhatsappAccountRequestSchema)) body: ConnectWhatsappAccountRequest,
  ): Promise<WhatsappAccountDto> {
    return this.connections.connect(tenantId, body);
  }

  /** Dev convenience: a fake connected number so campaigns can be tried without Meta credentials. */
  @Post('mock-connect')
  async mockConnect(@TenantId() tenantId: string): Promise<WhatsappAccountDto> {
    return toWhatsappAccountDto(await this.connections.mockConnect(tenantId));
  }

  @Patch('me')
  update(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(UpdateWhatsappAccountRequestSchema)) body: UpdateWhatsappAccountRequest,
  ): Promise<WhatsappAccountDto> {
    return this.connections.update(tenantId, body);
  }

  @Delete('me')
  disconnect(@TenantId() tenantId: string): Promise<WhatsappAccountDto> {
    return this.connections.disconnect(tenantId);
  }
}
