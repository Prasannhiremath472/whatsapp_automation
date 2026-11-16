import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Durable inbox for Meta webhook payloads (stored in MySQL, no Redis needed).
 *
 * The webhook controller only has to persist the payload and answer Meta
 * quickly; WebhookWorker processes it right after. Because the payload is in
 * the database first, a restart or crash between "received" and "processed"
 * loses nothing.
 */
@Injectable()
export class WebhookEventsService {
  private wakeup?: () => void;

  constructor(private readonly prisma: PrismaService) {}

  /** Registered by WebhookWorker so new events are handled at once instead of at the next poll. */
  onEnqueue(listener: () => void): void {
    this.wakeup = listener;
  }

  /** Stores a payload for processing. `delayMs` defers it (used for simulated mock-mode receipts). */
  async enqueue(payload: object, options: { delayMs?: number } = {}): Promise<void> {
    const delayMs = Math.max(0, options.delayMs ?? 0);
    await this.prisma.webhookEvent.create({
      data: { payload: payload as Prisma.InputJsonValue, runAfter: new Date(Date.now() + delayMs) },
    });
    if (delayMs === 0) this.wakeup?.();
  }
}
