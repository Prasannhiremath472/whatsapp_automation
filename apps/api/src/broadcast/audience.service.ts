import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Audience, AudiencePreview } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

/** Resolves a campaign's audience definition to concrete contacts. */
@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The where-clause for every contact matched by the audience (opted-out included). */
  where(tenantId: string, audience: Audience): Prisma.ContactWhereInput {
    switch (audience.mode) {
      case 'all':
        return { tenantId };
      case 'tags':
        return { tenantId, tags: { some: { tag: { name: { in: audience.tags } } } } };
      case 'contacts':
        // Always intersected with tenantId: ids from the client are never trusted.
        return { tenantId, id: { in: audience.contactIds } };
    }
  }

  async count(tenantId: string, audience: Audience): Promise<{ total: number; optedOut: number }> {
    const where = this.where(tenantId, audience);
    const [total, optedOut] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.count({ where: { AND: [where, { optedOut: true }] } }),
    ]);
    return { total, optedOut };
  }

  async preview(tenantId: string, audience: Audience): Promise<AudiencePreview> {
    const where = this.where(tenantId, audience);
    const [{ total, optedOut }, sample] = await Promise.all([
      this.count(tenantId, audience),
      this.prisma.contact.findMany({
        where: { AND: [where, { optedOut: false }] },
        select: { id: true, waId: true, displayName: true, profileName: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    return {
      total,
      eligible: total - optedOut,
      optedOut,
      sample: sample.map((c) => ({ id: c.id, name: c.displayName ?? c.profileName ?? '', phone: c.waId })),
    };
  }

  /** Iterates the audience in id order, 1000 contacts at a time. */
  async *iterate(tenantId: string, audience: Audience): AsyncGenerator<{ id: string; optedOut: boolean }[]> {
    const where = this.where(tenantId, audience);
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.contact.findMany({
        where,
        select: { id: true, optedOut: true },
        orderBy: { id: 'asc' },
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) return;
      yield rows;
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < 1000) return;
    }
  }
}
