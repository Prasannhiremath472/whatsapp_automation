import { Injectable, NotFoundException } from '@nestjs/common';
import type { Machine, MachineCategory, MachineConfigGroup, MachineConfigOption } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type MachineWithConfig = Machine & {
  configGroups: (MachineConfigGroup & { options: MachineConfigOption[] })[];
};

/**
 * Tenant-scoped, read-only catalog lookups used by CommerceBotFlowEngine.
 * This is also the seam a future admin-panel catalog editor would sit
 * behind for writes — Phase 1 only needs reads.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveCategories(tenantId: string): Promise<MachineCategory[]> {
    return this.prisma.machineCategory.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Max 10 rows — WhatsApp's List Message limit. Truncates and lets the caller warn if exceeded. */
  async listActiveMachinesInCategory(tenantId: string, categoryId: string): Promise<Machine[]> {
    return this.prisma.machine.findMany({
      where: { tenantId, categoryId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: 10,
    });
  }

  async getMachineOrThrow(tenantId: string, machineId: string): Promise<MachineWithConfig> {
    const machine = await this.prisma.machine.findUnique({
      where: { id: machineId },
      include: { configGroups: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!machine || machine.tenantId !== tenantId) {
      throw new NotFoundException('Machine not found');
    }
    return machine;
  }

  async getConfigGroupOrThrow(tenantId: string, groupId: string): Promise<MachineConfigGroup & { options: MachineConfigOption[] }> {
    const group = await this.prisma.machineConfigGroup.findUnique({
      where: { id: groupId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!group || group.tenantId !== tenantId) {
      throw new NotFoundException('Configuration group not found');
    }
    return group;
  }

  async getConfigOptionOrThrow(tenantId: string, optionId: string): Promise<MachineConfigOption> {
    const option = await this.prisma.machineConfigOption.findUnique({ where: { id: optionId } });
    if (!option || option.tenantId !== tenantId) {
      throw new NotFoundException('Configuration option not found');
    }
    return option;
  }
}
