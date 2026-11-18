import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreateTicketRequestSchema,
  ReplyTicketRequestSchema,
  TicketStatusSchema,
  type CreateTicketRequest,
  type JwtClaims,
  type TicketDetailDto,
  type TicketDto,
  type TicketStatus,
} from '@whatsapp-crm/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SupportService } from './support.service';

/** Support tickets of the signed-in business, visible to everyone on its team. */
@Controller('support/tickets')
@Roles('tenant_admin', 'agent')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query('status') status?: string): Promise<TicketDto[]> {
    const parsed = status ? TicketStatusSchema.safeParse(status) : null;
    return this.support.list(tenantId, parsed?.success ? (parsed.data as TicketStatus) : undefined);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtClaims,
    @Body(new ZodValidationPipe(CreateTicketRequestSchema)) body: CreateTicketRequest,
  ): Promise<TicketDetailDto> {
    return this.support.create(tenantId, user.sub, body);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TicketDetailDto> {
    return this.support.get(tenantId, id);
  }

  @Post(':id/messages')
  reply(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReplyTicketRequestSchema)) body: { message: string },
  ): Promise<TicketDetailDto> {
    return this.support.reply(tenantId, user.sub, id, body.message);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<TicketDetailDto> {
    return this.support.close(tenantId, id);
  }
}
