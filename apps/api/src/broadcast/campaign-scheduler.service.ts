import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULER_INTERVAL_MS } from './broadcast-queue.constants';
import { CampaignsService } from './campaigns.service';

/**
 * Database-driven scheduler (nothing is kept only in memory). Every few
 * seconds it:
 *  1. starts scheduled campaigns whose time has arrived, and
 *  2. re-wakes "running" campaigns that no dispatcher currently owns (after a
 *     crash, a resume race, or a tenant-serialisation wait).
 * Both steps are safe to run on several API instances at once.
 */
@Injectable()
export class CampaignScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignScheduler.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), SCHEDULER_INTERVAL_MS);
    this.timer.unref(); // never keep the process (or a test run) alive
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Public so tests (and ops) can trigger a pass immediately. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = new Date();

      const due = await this.prisma.broadcastCampaign.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: now } },
        take: 50,
      });
      for (const campaign of due) await this.campaigns.startScheduled(campaign);

      const orphaned = await this.prisma.broadcastCampaign.findMany({
        where: { status: 'running', OR: [{ dispatcherLockedUntil: null }, { dispatcherLockedUntil: { lt: now } }] },
        select: { id: true, tenantId: true },
        take: 50,
      });
      for (const c of orphaned) await this.campaigns.enqueueDispatch(c.id, c.tenantId);
    } catch (err) {
      this.logger.error(`Scheduler pass failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }
}
