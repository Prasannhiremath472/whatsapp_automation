import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type BroadcastCampaign, type BroadcastCampaignStatus, type MessageTemplate } from '@prisma/client';
import {
  extractVariableNumbers,
  variableCount,
  type Audience,
  type AudiencePreview,
  type CampaignDto,
  type ListCampaignsQuery,
  type ListRecipientsQuery,
  type CampaignRecipientDto,
  type Paginated,
  type SaveCampaignRequest,
  type VariableMapping,
} from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceService } from './audience.service';
import { CampaignDispatcher } from './campaign-dispatcher.processor';
import { isValidTimeZone, zonedTimeToUtc } from './timezone';

type CampaignWithTemplate = BroadcastCampaign & { template: Pick<MessageTemplate, 'name'> };

const EDITABLE: BroadcastCampaignStatus[] = ['draft', 'scheduled'];

export function toCampaignDto(c: CampaignWithTemplate): CampaignDto {
  return {
    id: c.id,
    name: c.name,
    objective: c.objective,
    description: c.description,
    status: c.status,
    statusReason: c.statusReason,
    templateId: c.templateId,
    templateName: c.template.name,
    audience: c.audience as unknown as Audience,
    variableMapping: c.variableMapping as unknown as VariableMapping,
    headerMediaUrl: c.headerMediaUrl,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    counts: {
      total: c.totalRecipients,
      sent: c.sentCount,
      delivered: c.deliveredCount,
      read: c.readCount,
      failed: c.failedCount,
      skipped: c.skippedCount,
      pending: Math.max(0, c.totalRecipients - c.sentCount - c.failedCount - c.skippedCount),
    },
    createdAt: c.createdAt.toISOString(),
  };
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly dispatcher: CampaignDispatcher,
  ) {}

  // ----------------------------------------------------------------- reads

  async list(tenantId: string, query: ListCampaignsQuery): Promise<Paginated<CampaignDto>> {
    const where: Prisma.BroadcastCampaignWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { name: { contains: query.q } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.broadcastCampaign.count({ where }),
      this.prisma.broadcastCampaign.findMany({
        where,
        include: { template: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map(toCampaignDto),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  /** Counts per status across every campaign — drives the summary tiles. */
  async summary(tenantId: string): Promise<Record<BroadcastCampaignStatus | 'total', number>> {
    const groups = await this.prisma.broadcastCampaign.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    const out = { total: 0, draft: 0, scheduled: 0, running: 0, paused: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const g of groups) {
      out[g.status] = g._count._all;
      out.total += g._count._all;
    }
    return out;
  }

  private async findOwned(tenantId: string, id: string): Promise<CampaignWithTemplate> {
    const campaign = await this.prisma.broadcastCampaign.findFirst({
      where: { id, tenantId },
      include: { template: { select: { name: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async get(tenantId: string, id: string): Promise<CampaignDto> {
    return toCampaignDto(await this.findOwned(tenantId, id));
  }

  async previewAudience(tenantId: string, audience: Audience): Promise<AudiencePreview> {
    return this.audience.preview(tenantId, audience);
  }

  async listRecipients(
    tenantId: string,
    id: string,
    query: ListRecipientsQuery,
  ): Promise<Paginated<CampaignRecipientDto>> {
    await this.findOwned(tenantId, id);
    const where: Prisma.BroadcastRecipientWhereInput = { campaignId: id, ...(query.status ? { status: query.status } : {}) };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.broadcastRecipient.count({ where }),
      this.prisma.broadcastRecipient.findMany({
        where,
        include: { contact: { select: { waId: true, displayName: true, profileName: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        contactId: r.contactId,
        name: r.contact.displayName ?? r.contact.profileName ?? '',
        phone: r.contact.waId,
        status: r.status,
        errorCode: r.errorCode,
        errorMessage: (r.errorDetail as { message?: string } | null)?.message ?? null,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        readAt: r.readAt?.toISOString() ?? null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  // ------------------------------------------------------------ draft CRUD

  private async scheduledAtFor(tenantId: string, input: SaveCampaignRequest): Promise<Date | null> {
    if (!input.schedule) return null;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const timeZone = tenant?.timezone && isValidTimeZone(tenant.timezone) ? tenant.timezone : 'UTC';
    const at = zonedTimeToUtc(input.schedule.date, input.schedule.time, timeZone);
    if (!at) throw new BadRequestException('That local time does not exist (daylight-saving gap). Pick another time.');
    return at;
  }

  private async assertTemplate(tenantId: string, templateId: string): Promise<MessageTemplate> {
    const template = await this.prisma.messageTemplate.findFirst({ where: { id: templateId, tenantId } });
    if (!template) throw new BadRequestException('templateId must reference a template in your organisation');
    return template;
  }

  async create(tenantId: string, userId: string, input: SaveCampaignRequest): Promise<CampaignDto> {
    await this.assertTemplate(tenantId, input.templateId);
    const scheduledAt = await this.scheduledAtFor(tenantId, input);
    const { eligible } = await this.audience.preview(tenantId, input.audience);

    const created = await this.prisma.broadcastCampaign.create({
      data: {
        tenantId,
        templateId: input.templateId,
        name: input.name,
        objective: input.objective ?? null,
        description: input.description ?? null,
        audience: input.audience as unknown as Prisma.InputJsonValue,
        variableMapping: input.variableMapping as unknown as Prisma.InputJsonValue,
        headerMediaUrl: input.headerMediaUrl ?? null,
        scheduledAt,
        totalRecipients: eligible,
        createdByUserId: userId,
        status: 'draft',
      },
      include: { template: { select: { name: true } } },
    });
    return toCampaignDto(created);
  }

  async update(tenantId: string, id: string, input: SaveCampaignRequest): Promise<CampaignDto> {
    const current = await this.findOwned(tenantId, id);
    if (!EDITABLE.includes(current.status)) {
      throw new ConflictException('Only draft or scheduled campaigns can be edited');
    }
    await this.assertTemplate(tenantId, input.templateId);
    const scheduledAt = await this.scheduledAtFor(tenantId, input);
    const { eligible } = await this.audience.preview(tenantId, input.audience);

    const updated = await this.prisma.broadcastCampaign.update({
      where: { id },
      data: {
        templateId: input.templateId,
        name: input.name,
        objective: input.objective ?? null,
        description: input.description ?? null,
        audience: input.audience as unknown as Prisma.InputJsonValue,
        variableMapping: input.variableMapping as unknown as Prisma.InputJsonValue,
        headerMediaUrl: input.headerMediaUrl ?? null,
        scheduledAt,
        totalRecipients: eligible,
        // A scheduled campaign whose schedule was removed goes back to draft.
        status: current.status === 'scheduled' && !scheduledAt ? 'draft' : current.status,
      },
      include: { template: { select: { name: true } } },
    });
    return toCampaignDto(updated);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const campaign = await this.findOwned(tenantId, id);
    if (campaign.status === 'running') {
      throw new ConflictException('Pause or cancel a running campaign before deleting it');
    }
    await this.prisma.broadcastCampaign.delete({ where: { id } });
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * Everything that must be true for a campaign to start sending. Run at
   * launch time and again when a scheduled campaign comes due.
   */
  async assertLaunchable(campaign: BroadcastCampaign): Promise<void> {
    const template = await this.prisma.messageTemplate.findUnique({ where: { id: campaign.templateId } });
    if (!template) throw new BadRequestException('The campaign template no longer exists');
    if (template.status !== 'approved') {
      throw new BadRequestException('Only approved templates can be sent. Submit this template for approval first.');
    }

    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId: campaign.tenantId } });
    if (!connection || connection.connectionStatus !== 'connected') {
      throw new BadRequestException('Connect a WhatsApp account before launching a campaign');
    }

    const mapping = campaign.variableMapping as unknown as VariableMapping;
    const bodyVars = variableCount(template.body);
    if ((mapping.body?.length ?? 0) !== bodyVars) {
      throw new BadRequestException(`Map all ${bodyVars} template variable(s) before launching`);
    }
    const headerVars = template.headerType === 'text' && template.headerText ? Math.min(1, extractVariableNumbers(template.headerText).length) : 0;
    if ((mapping.header?.length ?? 0) !== headerVars) {
      throw new BadRequestException('Map the header variable before launching');
    }
    if (['image', 'video', 'document'].includes(template.headerType) && !campaign.headerMediaUrl) {
      throw new BadRequestException(`This template has a ${template.headerType} header — provide its media URL`);
    }

    const { eligible } = await this.audience.preview(campaign.tenantId, campaign.audience as unknown as Audience);
    if (eligible === 0) {
      throw new BadRequestException('This audience has no contacts who can receive messages (empty or all opted out)');
    }

    if (connection.dailyMessageLimit) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sentToday = await this.prisma.broadcastRecipient.count({
        where: { campaign: { tenantId: campaign.tenantId }, sentAt: { gte: since } },
      });
      if (sentToday + eligible > connection.dailyMessageLimit) {
        throw new BadRequestException(
          `This would exceed your daily limit of ${connection.dailyMessageLimit} messages (${sentToday} already sent in the last 24 hours, ${eligible} in this campaign).`,
        );
      }
    }
  }

  async launch(tenantId: string, id: string): Promise<CampaignDto> {
    const campaign = await this.findOwned(tenantId, id);
    if (!EDITABLE.includes(campaign.status)) throw new ConflictException(`A ${campaign.status} campaign cannot be launched`);
    await this.assertLaunchable(campaign);

    const now = Date.now();
    if (campaign.scheduledAt && campaign.scheduledAt.getTime() > now) {
      const scheduled = await this.prisma.broadcastCampaign.update({
        where: { id },
        data: { status: 'scheduled', statusReason: null },
        include: { template: { select: { name: true } } },
      });
      this.logger.log(`Campaign scheduled id=${id} at=${campaign.scheduledAt.toISOString()}`);
      return toCampaignDto(scheduled);
    }
    if (campaign.scheduledAt && now - campaign.scheduledAt.getTime() > 5 * 60_000) {
      throw new BadRequestException('The scheduled time has already passed. Edit the schedule or send immediately.');
    }

    await this.claimAndEnqueue(campaign.id, campaign.tenantId);
    return this.get(tenantId, id);
  }

  /** Atomically flips draft/scheduled -> running (one winner) and wakes a dispatcher. */
  async claimAndEnqueue(id: string, tenantId: string): Promise<boolean> {
    const claimed = await this.prisma.broadcastCampaign.updateMany({
      where: { id, tenantId, status: { in: EDITABLE } },
      data: { status: 'running', startedAt: new Date(), statusReason: null },
    });
    if (claimed.count === 0) return false;
    await this.enqueueDispatch(id, tenantId);
    return true;
  }

  /** Called by the scheduler when a scheduled campaign's time arrives. */
  async startScheduled(campaign: BroadcastCampaign): Promise<void> {
    try {
      await this.assertLaunchable(campaign);
    } catch (err) {
      const reason = err instanceof BadRequestException ? String((err.getResponse() as { message?: string }).message ?? err.message) : 'Could not start';
      await this.prisma.broadcastCampaign.updateMany({
        where: { id: campaign.id, status: 'scheduled' },
        data: { status: 'failed', statusReason: reason.slice(0, 190), completedAt: new Date() },
      });
      this.logger.warn(`Scheduled campaign ${campaign.id} could not start: ${reason}`);
      return;
    }
    await this.claimAndEnqueue(campaign.id, campaign.tenantId);
  }

  /** Wakes a dispatcher for a running campaign (ignored if one is already on it). */
  async enqueueDispatch(campaignId: string, _tenantId: string): Promise<void> {
    this.dispatcher.enqueue(campaignId);
  }

  async pause(tenantId: string, id: string): Promise<CampaignDto> {
    await this.findOwned(tenantId, id);
    const result = await this.prisma.broadcastCampaign.updateMany({
      where: { id, tenantId, status: 'running' },
      data: { status: 'paused', statusReason: 'Paused by user' },
    });
    if (result.count === 0) throw new ConflictException('Only a running campaign can be paused');
    return this.get(tenantId, id);
  }

  async resume(tenantId: string, id: string): Promise<CampaignDto> {
    const campaign = await this.findOwned(tenantId, id);
    if (campaign.status !== 'paused') throw new ConflictException('Only a paused campaign can be resumed');
    await this.assertLaunchable(campaign);
    const result = await this.prisma.broadcastCampaign.updateMany({
      where: { id, tenantId, status: 'paused' },
      data: { status: 'running', statusReason: null },
    });
    if (result.count > 0) await this.enqueueDispatch(id, tenantId);
    return this.get(tenantId, id);
  }

  async cancel(tenantId: string, id: string): Promise<CampaignDto> {
    const campaign = await this.findOwned(tenantId, id);
    if (!['draft', 'scheduled', 'running', 'paused'].includes(campaign.status)) {
      throw new ConflictException(`A ${campaign.status} campaign cannot be cancelled`);
    }
    await this.prisma.broadcastCampaign.updateMany({
      where: { id, tenantId, status: { in: ['draft', 'scheduled', 'running', 'paused'] } },
      data: { status: 'cancelled', statusReason: 'Cancelled by user', completedAt: new Date() },
    });
    // Anything not yet picked up will never be sent.
    const skipped = await this.prisma.broadcastRecipient.updateMany({
      where: { campaignId: id, status: 'pending' },
      data: { status: 'skipped', errorCode: 'cancelled' },
    });
    if (skipped.count > 0) {
      await this.prisma.broadcastCampaign.update({ where: { id }, data: { skippedCount: { increment: skipped.count } } });
    }
    return this.get(tenantId, id);
  }

  /** Re-queues every failed recipient of a finished campaign. */
  async retryFailed(tenantId: string, id: string): Promise<CampaignDto> {
    const campaign = await this.findOwned(tenantId, id);
    if (!['completed', 'failed'].includes(campaign.status)) {
      throw new ConflictException('Failed messages can be retried once the campaign has finished');
    }
    await this.assertLaunchable(campaign);
    const reset = await this.prisma.broadcastRecipient.updateMany({
      where: { campaignId: id, status: 'failed' },
      data: { status: 'pending', attempts: 0, errorCode: null, errorDetail: Prisma.DbNull },
    });
    if (reset.count === 0) throw new BadRequestException('There are no failed messages to retry');

    await this.prisma.broadcastCampaign.update({
      where: { id },
      data: { status: 'running', statusReason: null, completedAt: null, failedCount: { decrement: reset.count } },
    });
    await this.enqueueDispatch(id, tenantId);
    return this.get(tenantId, id);
  }

  /** Rebuilds the denormalised counters from the recipient rows (repair / after bulk changes). */
  async recomputeCounters(campaignId: string): Promise<void> {
    const groups = await this.prisma.broadcastRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    await this.prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        totalRecipients: groups.reduce((sum, g) => sum + g._count._all, 0),
        sentCount: n('sent') + n('delivered') + n('read'),
        deliveredCount: n('delivered') + n('read'),
        readCount: n('read'),
        failedCount: n('failed'),
        skippedCount: n('skipped'),
      },
    });
  }
}
