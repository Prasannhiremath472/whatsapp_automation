import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Machine, MachineCategory, MachineConfigGroup, MachineConfigOption, Order } from '@prisma/client';
import {
  SaveConfigGroupRequestSchema,
  SaveConfigOptionRequestSchema,
  SaveMachineCategoryRequestSchema,
  SaveMachineRequestSchema,
} from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

/**
 * Catalog admin endpoints for the commerce bot (Phase 3). Tenant admins
 * manage their own categories/machines/config options here; the
 * conversation flow structure itself stays fixed in code — only this data
 * changes what the bot shows.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommerceBotCatalogController {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new ForbiddenException('This account is not associated with a tenant');
    return tenantId;
  }

  // --- Categories ----------------------------------------------------------

  @Roles('tenant_admin', 'agent')
  @Get('commerce-bot/categories')
  async listCategories(@CurrentTenant() tenantId: string | null): Promise<MachineCategory[]> {
    return this.prisma.machineCategory.findMany({ where: { tenantId: this.requireTenant(tenantId) }, orderBy: { sortOrder: 'asc' } });
  }

  @Roles('tenant_admin')
  @Post('commerce-bot/categories')
  async createCategory(@CurrentTenant() tenantId: string | null, @Body() body: unknown): Promise<MachineCategory> {
    const tid = this.requireTenant(tenantId);
    const input = SaveMachineCategoryRequestSchema.parse(body);
    return this.prisma.machineCategory.create({
      data: { tenantId: tid, name: input.name, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true },
    });
  }

  @Roles('tenant_admin')
  @Patch('commerce-bot/categories/:id')
  async updateCategory(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MachineCategory> {
    const tid = this.requireTenant(tenantId);
    await this.findCategoryOrThrow(tid, id);
    const input = SaveMachineCategoryRequestSchema.partial().parse(body);
    return this.prisma.machineCategory.update({ where: { id }, data: input });
  }

  @Roles('tenant_admin')
  @Delete('commerce-bot/categories/:id')
  async deactivateCategory(@CurrentTenant() tenantId: string | null, @Param('id') id: string): Promise<MachineCategory> {
    const tid = this.requireTenant(tenantId);
    await this.findCategoryOrThrow(tid, id);
    // Soft-delete only: machines already sold under this category must keep
    // referencing it for order history, so we deactivate rather than remove.
    return this.prisma.machineCategory.update({ where: { id }, data: { isActive: false } });
  }

  private async findCategoryOrThrow(tenantId: string, id: string): Promise<MachineCategory> {
    const category = await this.prisma.machineCategory.findUnique({ where: { id } });
    if (!category || category.tenantId !== tenantId) throw new NotFoundException('Category not found');
    return category;
  }

  // --- Machines --------------------------------------------------------------

  @Roles('tenant_admin', 'agent')
  @Get('commerce-bot/machines')
  async listMachines(@CurrentTenant() tenantId: string | null): Promise<Machine[]> {
    return this.prisma.machine.findMany({ where: { tenantId: this.requireTenant(tenantId) }, orderBy: { sortOrder: 'asc' } });
  }

  @Roles('tenant_admin', 'agent')
  @Get('commerce-bot/machines/:id')
  async getMachine(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
  ): Promise<Machine & { configGroups: (MachineConfigGroup & { options: MachineConfigOption[] })[] }> {
    const tid = this.requireTenant(tenantId);
    const machine = await this.prisma.machine.findUnique({
      where: { id },
      include: { configGroups: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!machine || machine.tenantId !== tid) throw new NotFoundException('Machine not found');
    return machine;
  }

  @Roles('tenant_admin')
  @Post('commerce-bot/machines')
  async createMachine(@CurrentTenant() tenantId: string | null, @Body() body: unknown): Promise<Machine> {
    const tid = this.requireTenant(tenantId);
    const input = SaveMachineRequestSchema.parse(body);
    await this.findCategoryOrThrow(tid, input.categoryId);
    return this.prisma.machine.create({
      data: {
        tenantId: tid,
        categoryId: input.categoryId,
        name: input.name,
        model: input.model,
        basePrice: input.basePrice,
        availability: input.availability ?? 'in_stock',
        specs: (input.specs ?? {}) as object,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }

  @Roles('tenant_admin')
  @Patch('commerce-bot/machines/:id')
  async updateMachine(@CurrentTenant() tenantId: string | null, @Param('id') id: string, @Body() body: unknown): Promise<Machine> {
    const tid = this.requireTenant(tenantId);
    await this.findMachineOrThrow(tid, id);
    const input = SaveMachineRequestSchema.partial().parse(body);
    if (input.categoryId) await this.findCategoryOrThrow(tid, input.categoryId);
    return this.prisma.machine.update({
      where: { id },
      data: { ...input, specs: input.specs ? (input.specs as object) : undefined },
    });
  }

  @Roles('tenant_admin')
  @Delete('commerce-bot/machines/:id')
  async deactivateMachine(@CurrentTenant() tenantId: string | null, @Param('id') id: string): Promise<Machine> {
    const tid = this.requireTenant(tenantId);
    await this.findMachineOrThrow(tid, id);
    return this.prisma.machine.update({ where: { id }, data: { isActive: false } });
  }

  private async findMachineOrThrow(tenantId: string, id: string): Promise<Machine> {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine || machine.tenantId !== tenantId) throw new NotFoundException('Machine not found');
    return machine;
  }

  // --- Config groups + options -----------------------------------------------

  @Roles('tenant_admin')
  @Post('commerce-bot/machines/:machineId/config-groups')
  async createConfigGroup(
    @CurrentTenant() tenantId: string | null,
    @Param('machineId') machineId: string,
    @Body() body: unknown,
  ): Promise<MachineConfigGroup> {
    const tid = this.requireTenant(tenantId);
    await this.findMachineOrThrow(tid, machineId);
    const input = SaveConfigGroupRequestSchema.parse(body);
    return this.prisma.machineConfigGroup.create({
      data: { tenantId: tid, machineId, name: input.name, isRequired: input.isRequired ?? true, sortOrder: input.sortOrder ?? 0 },
    });
  }

  @Roles('tenant_admin')
  @Patch('commerce-bot/config-groups/:id')
  async updateConfigGroup(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MachineConfigGroup> {
    const tid = this.requireTenant(tenantId);
    await this.findConfigGroupOrThrow(tid, id);
    const input = SaveConfigGroupRequestSchema.partial().parse(body);
    return this.prisma.machineConfigGroup.update({ where: { id }, data: input });
  }

  @Roles('tenant_admin')
  @Delete('commerce-bot/config-groups/:id')
  async deleteConfigGroup(@CurrentTenant() tenantId: string | null, @Param('id') id: string): Promise<{ deleted: true }> {
    const tid = this.requireTenant(tenantId);
    await this.findConfigGroupOrThrow(tid, id);
    // Hard-delete is safe here: unlike machines/categories, config groups
    // aren't directly referenced by Order (Order.selectedConfig is a
    // denormalized snapshot), so removing a group never breaks order history.
    await this.prisma.machineConfigOption.deleteMany({ where: { groupId: id } });
    await this.prisma.machineConfigGroup.delete({ where: { id } });
    return { deleted: true };
  }

  private async findConfigGroupOrThrow(tenantId: string, id: string): Promise<MachineConfigGroup> {
    const group = await this.prisma.machineConfigGroup.findUnique({ where: { id } });
    if (!group || group.tenantId !== tenantId) throw new NotFoundException('Configuration group not found');
    return group;
  }

  @Roles('tenant_admin')
  @Post('commerce-bot/config-groups/:groupId/options')
  async createConfigOption(
    @CurrentTenant() tenantId: string | null,
    @Param('groupId') groupId: string,
    @Body() body: unknown,
  ): Promise<MachineConfigOption> {
    const tid = this.requireTenant(tenantId);
    await this.findConfigGroupOrThrow(tid, groupId);
    const input = SaveConfigOptionRequestSchema.parse(body);
    return this.prisma.machineConfigOption.create({
      data: {
        tenantId: tid,
        groupId,
        label: input.label,
        priceDelta: input.priceDelta,
        isDefault: input.isDefault ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  @Roles('tenant_admin')
  @Patch('commerce-bot/config-options/:id')
  async updateConfigOption(
    @CurrentTenant() tenantId: string | null,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MachineConfigOption> {
    const tid = this.requireTenant(tenantId);
    await this.findConfigOptionOrThrow(tid, id);
    const input = SaveConfigOptionRequestSchema.partial().parse(body);
    return this.prisma.machineConfigOption.update({ where: { id }, data: input });
  }

  @Roles('tenant_admin')
  @Delete('commerce-bot/config-options/:id')
  async deleteConfigOption(@CurrentTenant() tenantId: string | null, @Param('id') id: string): Promise<{ deleted: true }> {
    const tid = this.requireTenant(tenantId);
    await this.findConfigOptionOrThrow(tid, id);
    await this.prisma.machineConfigOption.delete({ where: { id } });
    return { deleted: true };
  }

  private async findConfigOptionOrThrow(tenantId: string, id: string): Promise<MachineConfigOption> {
    const option = await this.prisma.machineConfigOption.findUnique({ where: { id } });
    if (!option || option.tenantId !== tenantId) throw new NotFoundException('Configuration option not found');
    return option;
  }

  // --- Orders (read-only) ----------------------------------------------------

  @Roles('tenant_admin', 'agent')
  @Get('commerce-bot/orders')
  async listOrders(@CurrentTenant() tenantId: string | null): Promise<Order[]> {
    return this.prisma.order.findMany({ where: { tenantId: this.requireTenant(tenantId) }, orderBy: { createdAt: 'desc' } });
  }
}
