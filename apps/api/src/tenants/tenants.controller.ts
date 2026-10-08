import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { Tenant, User } from '@whatsapp-crm/shared-types';
import { CreateTenantRequestSchema, UpdateTenantRequestSchema } from '@whatsapp-crm/shared-types';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtClaims } from '@whatsapp-crm/shared-types';
import { NotFoundException } from '@nestjs/common';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Own-tenant lookup for tenant_admin/agent. Deliberately NOT a
   * `:id`/`:tenantId` route param — tenantId is derived from the caller's
   * JWT only, so a tenant_admin/agent can never probe another tenant by
   * guessing an id in the URL.
   */
  @Get('me')
  @Roles('tenant_admin', 'agent')
  async getMyTenant(@CurrentUser() user: JwtClaims): Promise<Tenant> {
    if (!user.tenantId) {
      throw new NotFoundException('No tenant associated with this account');
    }
    return this.tenantsService.findById(user.tenantId);
  }

  @Post()
  @Roles('super_admin')
  async create(@Body() body: unknown): Promise<{ tenant: Tenant; admin: User }> {
    const parsed = CreateTenantRequestSchema.parse(body);
    return this.tenantsService.createTenantWithAdmin(parsed);
  }

  @Get()
  @Roles('super_admin')
  async list(): Promise<Tenant[]> {
    return this.tenantsService.list();
  }

  @Get(':id')
  @Roles('super_admin')
  async findOne(@Param('id') id: string): Promise<Tenant> {
    return this.tenantsService.findById(id);
  }

  @Patch(':id')
  @Roles('super_admin')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<Tenant> {
    const parsed = UpdateTenantRequestSchema.parse(body);
    return this.tenantsService.update(id, parsed);
  }
}
