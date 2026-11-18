import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac } from 'node:crypto';
import { decryptSecret } from '../common/crypto/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { safeHttpsAgent } from './safe-url';

const TICK_MS = 3_000;
const LEASE_MS = 60_000;
/** Wait before retry 1, 2, 3 ... After the last one the delivery is marked failed. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
const AUTO_DISABLE_AFTER = 30;
const KEEP_DAYS = 14;

/** X-Genie-Signature header value: "t=<unix seconds>,v1=<hex hmac-sha256 of `${t}.${body}`>". */
export function signPayload(secret: string, body: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Sends queued webhook deliveries, with retries. State lives in MySQL so a restart loses nothing. */
@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
      const due = await this.prisma.webhookDelivery.findMany({
        where: { status: 'pending', runAfter: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const delivery of due) {
        const claimed = await this.prisma.webhookDelivery.updateMany({
          where: { id: delivery.id, status: 'pending', OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
          data: { lockedUntil: new Date(now.getTime() + LEASE_MS) },
        });
        if (claimed.count === 0) continue;
        await this.deliver(delivery.id);
      }
      if (Date.now() - this.lastCleanup > 6 * 3_600_000) {
        this.lastCleanup = Date.now();
        await this.prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
      }
    } catch (err) {
      this.logger.error(`Webhook delivery pass failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async deliver(id: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id }, include: { endpoint: true } });
    if (!delivery) return;
    const { endpoint } = delivery;

    const attempts = delivery.attempts + 1;
    let responseStatus: number | null = null;
    let error: string | null = null;
    try {
      const secret = decryptSecret(endpoint.secretCipher, this.config.get<string>('ENCRYPTION_KEY'));
      const body = JSON.stringify(delivery.payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const res = await axios.post(endpoint.url, body, {
        httpsAgent: safeHttpsAgent,
        timeout: 10_000,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Genie-Webhooks/1.0',
          'x-genie-event': delivery.event,
          'x-genie-delivery': delivery.id,
          'x-genie-signature': signPayload(secret, body, timestamp),
        },
      });
      responseStatus = res.status;
      if (res.status < 200 || res.status >= 300) error = `The receiver answered with HTTP ${res.status}`;
    } catch (err) {
      error = (err as Error).message.slice(0, 300);
    }

    const ok = error === null;
    const exhausted = !ok && attempts > RETRY_DELAYS_MS.length;
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        responseStatus,
        error,
        lastAttemptAt: new Date(),
        lockedUntil: null,
        status: ok ? 'success' : exhausted ? 'failed' : 'pending',
        ...(ok || exhausted ? {} : { runAfter: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]!) }),
      },
    });

    const fails = ok ? 0 : endpoint.consecutiveFails + 1;
    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        lastDeliveryAt: new Date(),
        lastStatus: ok ? 'success' : (error ?? 'failed').slice(0, 100),
        consecutiveFails: fails,
        ...(fails >= AUTO_DISABLE_AFTER ? { active: false } : {}),
      },
    });
    if (fails >= AUTO_DISABLE_AFTER) this.logger.warn(`Webhook endpoint ${endpoint.id} disabled after ${fails} failures`);
  }
}
