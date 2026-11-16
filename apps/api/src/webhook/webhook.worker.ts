import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WEBHOOK_FAILED_RETENTION_MS,
  WEBHOOK_LOCK_MS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_POLL_INTERVAL_MS,
} from './webhook-events.constants';
import { WebhookEventsService } from './webhook-events.service';
import type { WebhookPayload } from './webhook-payload.types';
import { WebhookProcessor } from './webhook.processor';

/**
 * Works through stored webhook events one at a time, oldest first.
 *
 * - Safe on several API instances: an event is claimed with a conditional
 *   update, so exactly one instance processes it.
 * - A processing error marks the event "failed" (kept for a week to inspect)
 *   and is NOT retried: re-running could double-apply a half-finished event.
 * - An event left "processing" by a crash is re-run once, then marked failed.
 */
@Injectable()
export class WebhookWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  private passes = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: WebhookEventsService,
    private readonly processor: WebhookProcessor,
  ) {}

  onModuleInit(): void {
    this.events.onEnqueue(() => void this.drain());
    this.timer = setInterval(() => void this.drain(), WEBHOOK_POLL_INTERVAL_MS);
    this.timer.unref(); // never keep the process (or a test run) alive
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined); // let the event in flight finish
  }

  /** Processes everything that is due. Public so tests (and ops) can trigger a pass immediately. */
  drain(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.running ??= this.loop().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async loop(): Promise<void> {
    try {
      await this.recoverStale();
      while (!this.stopped && (await this.processNext())) {
        // keep going until nothing is due
      }
    } catch (err) {
      this.logger.error(`Webhook worker pass failed: ${(err as Error).message}`);
    }
  }

  /** Returns false when nothing was due. */
  private async processNext(): Promise<boolean> {
    const next = await this.prisma.webhookEvent.findFirst({
      where: { status: 'pending', runAfter: { lte: new Date() } },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
    });
    if (!next) return false;

    const claimed = await this.prisma.webhookEvent.updateMany({
      where: { id: next.id, status: 'pending' },
      data: { status: 'processing', attempts: { increment: 1 }, lockedUntil: new Date(Date.now() + WEBHOOK_LOCK_MS) },
    });
    if (claimed.count === 0) return true; // another instance took it

    try {
      await this.processor.process(next.payload as unknown as WebhookPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook event ${next.id} failed: ${message}`, err instanceof Error ? err.stack : undefined);
      await this.prisma.webhookEvent
        .updateMany({ where: { id: next.id }, data: { status: 'failed', lockedUntil: null, lastError: message.slice(0, 500) } })
        .catch(() => undefined);
      return true;
    }

    await this.prisma.webhookEvent
      .deleteMany({ where: { id: next.id } })
      .catch((err: Error) => this.logger.warn(`Processed webhook event ${next.id} but could not delete it: ${err.message}`));
    return true;
  }

  /** Events stuck in "processing" belong to a crashed worker; also prunes old failures now and then. */
  private async recoverStale(): Promise<void> {
    const now = new Date();
    const stale = await this.prisma.webhookEvent.findMany({
      where: { status: 'processing', lockedUntil: { lt: now } },
      take: 50,
    });
    for (const event of stale) {
      const retry = event.attempts < WEBHOOK_MAX_ATTEMPTS;
      await this.prisma.webhookEvent.updateMany({
        where: { id: event.id, status: 'processing', lockedUntil: { lt: now } },
        data: retry
          ? { status: 'pending', lockedUntil: null }
          : { status: 'failed', lockedUntil: null, lastError: 'Interrupted while processing (server restart)' },
      });
      this.logger.warn(`Webhook event ${event.id} was interrupted; ${retry ? 'retrying' : 'marked failed'}`);
    }

    if (++this.passes % 60 === 0) {
      await this.prisma.webhookEvent.deleteMany({
        where: { status: 'failed', createdAt: { lt: new Date(Date.now() - WEBHOOK_FAILED_RETENTION_MS) } },
      });
    }
  }
}
