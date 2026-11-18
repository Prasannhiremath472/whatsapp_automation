import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEngine } from './automation-engine.service';

const TICK_MS = 15_000;
const LEASE_MS = 2 * 60_000;

/**
 * Resumes automation runs whose "wait" has elapsed. All state is in MySQL (a
 * conditional update claims a run), so a restart never loses or repeats one.
 */
@Injectable()
export class AutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationScheduler.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationEngine,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Public so tests can run a pass immediately. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = new Date();
      const due = await this.prisma.automationRun.findMany({
        where: {
          OR: [
            { status: 'waiting', resumeAt: { lte: now } },
            // A run that was being executed when the process died.
            { status: 'running', lockedUntil: { lt: now } },
          ],
        },
        take: 25,
      });
      for (const run of due) {
        const claimed = await this.prisma.automationRun.updateMany({
          where: { id: run.id, status: run.status, updatedAt: run.updatedAt },
          data: { status: 'running', lockedUntil: new Date(now.getTime() + LEASE_MS) },
        });
        if (claimed.count === 0) continue; // another pass took it
        await this.engine.execute({ ...run, status: 'running' });
      }
    } catch (err) {
      this.logger.error(`Automation scheduler pass failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }
}
