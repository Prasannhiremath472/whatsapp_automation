import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Automation } from '@prisma/client';
import type {
  AutomationDto,
  AutomationRunDto,
  AutomationStep,
  SaveAutomationRequest,
  TriggerConfig,
} from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

function toDto(a: Automation): AutomationDto {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    status: a.status,
    triggerType: a.triggerType as AutomationDto['triggerType'],
    triggerConfig: a.triggerConfig as unknown as TriggerConfig,
    steps: a.steps as unknown as AutomationStep[],
    cooldownMinutes: a.cooldownMinutes,
    runCount: a.runCount,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<AutomationDto[]> {
    const rows = await this.prisma.automation.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toDto);
  }

  private async findOwned(tenantId: string, id: string): Promise<Automation> {
    const row = await this.prisma.automation.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Automation not found');
    return row;
  }

  /** Steps may only point at this business's own templates and team members. */
  private async assertStepsBelongToTenant(tenantId: string, steps: AutomationStep[]): Promise<void> {
    for (const step of steps) {
      if (step.type === 'send_template') {
        const template = await this.prisma.messageTemplate.findFirst({ where: { id: step.templateId, tenantId } });
        if (!template) throw new BadRequestException('A "send template" step uses a template that does not exist');
      }
      if (step.type === 'assign' && step.agentUserId) {
        const user = await this.prisma.user.findFirst({ where: { id: step.agentUserId, tenantId, isActive: true } });
        if (!user) throw new BadRequestException('An "assign" step uses a team member who does not exist');
      }
    }
  }

  async create(tenantId: string, input: SaveAutomationRequest): Promise<AutomationDto> {
    await this.assertStepsBelongToTenant(tenantId, input.steps);
    const created = await this.prisma.automation.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description || null,
        status: 'draft',
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig as unknown as Prisma.InputJsonValue,
        steps: input.steps as unknown as Prisma.InputJsonValue,
        cooldownMinutes: input.cooldownMinutes,
      },
    });
    return toDto(created);
  }

  async update(tenantId: string, id: string, input: SaveAutomationRequest): Promise<AutomationDto> {
    await this.findOwned(tenantId, id);
    await this.assertStepsBelongToTenant(tenantId, input.steps);
    const updated = await this.prisma.automation.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description || null,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig as unknown as Prisma.InputJsonValue,
        steps: input.steps as unknown as Prisma.InputJsonValue,
        cooldownMinutes: input.cooldownMinutes,
      },
    });
    return toDto(updated);
  }

  async setStatus(tenantId: string, id: string, status: 'active' | 'paused'): Promise<AutomationDto> {
    await this.findOwned(tenantId, id);
    return toDto(await this.prisma.automation.update({ where: { id }, data: { status } }));
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOwned(tenantId, id);
    await this.prisma.automation.delete({ where: { id } });
  }

  async recentRuns(tenantId: string, id: string): Promise<AutomationRunDto[]> {
    await this.findOwned(tenantId, id);
    const runs = await this.prisma.automationRun.findMany({
      where: { automationId: id, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: runs.map((r) => r.conversationId) }, tenantId },
      include: { contact: true },
    });
    const nameOf = new Map(
      conversations.map((c) => [c.id, c.contact.displayName || c.contact.profileName || `+${c.contact.waId}`]),
    );
    return runs.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      contactName: nameOf.get(r.conversationId) ?? 'Unknown contact',
      status: r.status,
      stepIndex: r.stepIndex,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
