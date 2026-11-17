import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnalyticsOverview, AnalyticsRange } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

const DAYS: Record<AnalyticsRange, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };

/** Minutes the time zone is ahead of UTC right now (e.g. +330 for Asia/Kolkata). */
export function utcOffsetMinutes(timeZone: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - (at.getTime() - at.getMilliseconds())) / 60000);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

type DayRow = { d: string; direction?: string; n: bigint | number };

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, range: AnalyticsRange): Promise<AnalyticsOverview> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    const offset = utcOffsetMinutes(tenant.timezone);
    const days = DAYS[range];

    // Start of the local day `days - 1` days ago, as a UTC instant.
    const localNow = new Date(Date.now() + offset * 60_000);
    const localMidnight = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
    const since = new Date(localMidnight - (days - 1) * 86_400_000 - offset * 60_000);
    const previousSince = new Date(since.getTime() - days * 86_400_000);

    const [outboundByStatus, inbound, previousSent, previousInbound] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['status'],
        where: { tenantId, direction: 'outbound', createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.message.count({ where: { tenantId, direction: 'inbound', createdAt: { gte: since } } }),
      this.prisma.message.count({
        where: { tenantId, direction: 'outbound', status: { not: 'failed' }, createdAt: { gte: previousSince, lt: since } },
      }),
      this.prisma.message.count({ where: { tenantId, direction: 'inbound', createdAt: { gte: previousSince, lt: since } } }),
    ]);
    const by = (s: string) => outboundByStatus.find((r) => r.status === s)?._count._all ?? 0;
    const failed = by('failed');
    const read = by('read');
    const delivered = by('delivered') + read;
    const sent = outboundByStatus.reduce((t, r) => t + (r.status === 'failed' ? 0 : r._count._all), 0);

    const [started, previousStarted, open, unread, contactsTotal, contactsNew, contactsPreviousNew, optedOut] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.conversation.count({ where: { tenantId, createdAt: { gte: previousSince, lt: since } } }),
      this.prisma.conversation.count({ where: { tenantId, status: { not: 'closed' } } }),
      this.prisma.conversation.count({ where: { tenantId, unreadCount: { gt: 0 } } }),
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.contact.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.contact.count({ where: { tenantId, createdAt: { gte: previousSince, lt: since } } }),
      this.prisma.contact.count({ where: { tenantId, optedOut: true } }),
    ]);

    // Per-day series, grouped in the business's time zone (a fixed offset keeps this independent of MySQL time-zone tables).
    const messageDays = await this.prisma.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(DATE_ADD(createdAt, INTERVAL ${offset} MINUTE), '%Y-%m-%d') AS d, direction, COUNT(*) AS n
      FROM messages WHERE tenantId = ${tenantId} AND createdAt >= ${since} GROUP BY d, direction`);
    const contactDays = await this.prisma.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(DATE_ADD(createdAt, INTERVAL ${offset} MINUTE), '%Y-%m-%d') AS d, COUNT(*) AS n
      FROM contacts WHERE tenantId = ${tenantId} AND createdAt >= ${since} GROUP BY d`);

    const daily: AnalyticsOverview['daily'] = [];
    for (let i = 0; i < days; i += 1) {
      const date = ymd(new Date(localMidnight - (days - 1 - i) * 86_400_000));
      const count = (rows: DayRow[], dir?: string) =>
        Number(rows.find((r) => r.d === date && (dir === undefined || r.direction === dir))?.n ?? 0);
      daily.push({ date, inbound: count(messageDays, 'inbound'), outbound: count(messageDays, 'outbound'), newContacts: count(contactDays) });
    }

    // Average time from a customer's first message to the first reply by a team member.
    const responseRows = await this.prisma.$queryRaw<{ s: number | string | null }[]>(Prisma.sql`
      SELECT AVG(TIMESTAMPDIFF(SECOND, fi.t, (
        SELECT MIN(o.createdAt) FROM messages o
        WHERE o.conversationId = fi.conversationId AND o.direction = 'outbound' AND o.senderType = 'agent' AND o.createdAt > fi.t
      ))) AS s
      FROM (
        SELECT conversationId, MIN(createdAt) AS t FROM messages
        WHERE tenantId = ${tenantId} AND direction = 'inbound' AND createdAt >= ${since} GROUP BY conversationId
      ) fi`);
    const avg = responseRows[0]?.s;

    const [campaignTotal, campaignRunning, recent] = await Promise.all([
      this.prisma.broadcastCampaign.count({ where: { tenantId } }),
      this.prisma.broadcastCampaign.count({ where: { tenantId, status: 'running' } }),
      this.prisma.broadcastCampaign.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

    return {
      range,
      since: since.toISOString(),
      messages: { sent, delivered, read, failed, inbound, previousSent, previousInbound },
      conversations: {
        started,
        previousStarted,
        open,
        unread,
        avgFirstResponseSeconds: avg === null || avg === undefined ? null : Math.round(Number(avg)),
      },
      contacts: { total: contactsTotal, new: contactsNew, previousNew: contactsPreviousNew, optedOut },
      daily,
      campaigns: {
        total: campaignTotal,
        running: campaignRunning,
        recent: recent.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          total: c.totalRecipients,
          sent: c.sentCount,
          delivered: c.deliveredCount,
          read: c.readCount,
          failed: c.failedCount,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    };
  }
}
