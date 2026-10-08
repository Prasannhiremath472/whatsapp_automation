import { Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import type { WhatsappConnection } from '@prisma/client';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@Controller('whatsapp-connections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappConnectionsController {
  constructor(private readonly whatsappConnectionsService: WhatsappConnectionsService) {}

  /**
   * tenantId comes ONLY from @CurrentTenant() (the caller's JWT), never
   * from the request body — same tenant-isolation pattern as M1's
   * UsersController.
   */
  @Roles('tenant_admin')
  @Post('mock-connect')
  mockConnect(@CurrentTenant() tenantId: string | null): Promise<WhatsappConnection> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    return this.whatsappConnectionsService.mockConnect(tenantId);
  }

  @Roles('tenant_admin', 'agent')
  @Get('me')
  findMine(@CurrentTenant() tenantId: string | null): Promise<WhatsappConnection> {
    if (!tenantId) {
      throw new ForbiddenException('This account is not associated with a tenant');
    }
    return this.whatsappConnectionsService.findForTenant(tenantId);
  }
}
