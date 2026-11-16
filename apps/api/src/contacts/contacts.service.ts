import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  normalizeWaId,
  type BulkTagRequest,
  type ContactDto,
  type CreateContactRequest,
  type ImportContactsRequest,
  type ImportContactsResult,
  type ListContactsQuery,
  type Paginated,
  type UpdateContactRequest,
} from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { WebhookInboundMessage } from '../webhook/webhook-payload.types';

const contactInclude = {
  tags: { include: { tag: true } },
  assignedUser: { select: { displayName: true } },
} satisfies Prisma.ContactInclude;

type ContactWithRelations = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;

/**
 * Keywords (case-insensitive, the whole message) that opt a contact out / back in.
 * Deliberately limited to unambiguous phrases: words like "cancel" or "end" are
 * normal replies in order/booking flows and must not unsubscribe anyone.
 */
const OPT_OUT_KEYWORDS = new Set(['stop', 'stop all', 'stopall', 'unsubscribe', 'opt out', 'optout']);
const OPT_IN_KEYWORDS = new Set(['start', 'unstop', 'subscribe', 'opt in', 'optin']);

export function toContactDto(c: ContactWithRelations): ContactDto {
  return {
    id: c.id,
    name: c.displayName ?? c.profileName ?? '',
    phone: c.waId,
    email: c.email,
    location: c.location,
    leadStatus: c.leadStatus,
    source: c.source,
    notes: c.notes,
    assignedUserId: c.assignedUserId,
    assignedUserName: c.assignedUser?.displayName ?? null,
    tags: c.tags.map((t) => t.tag.name).sort((a, b) => a.localeCompare(b)),
    optedOut: c.optedOut,
    lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- queries

  private buildWhere(tenantId: string, q: Partial<ListContactsQuery>): Prisma.ContactWhereInput {
    const where: Prisma.ContactWhereInput = { tenantId };
    const and: Prisma.ContactWhereInput[] = [];
    if (q.q) {
      const needle = q.q.replace(/^\+/, '');
      and.push({
        OR: [
          { displayName: { contains: q.q } },
          { profileName: { contains: q.q } },
          { waId: { contains: needle } },
          { email: { contains: q.q } },
        ],
      });
    }
    if (q.tag) and.push({ tags: { some: { tag: { name: q.tag } } } });
    if (q.location) and.push({ location: q.location });
    if (q.leadStatus) and.push({ leadStatus: q.leadStatus });
    if (q.optedOut !== undefined) and.push({ optedOut: q.optedOut });
    if (and.length) where.AND = and;
    return where;
  }

  async list(tenantId: string, query: ListContactsQuery): Promise<Paginated<ContactDto>> {
    const where = this.buildWhere(tenantId, query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        include: contactInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map(toContactDto),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  }

  async get(tenantId: string, id: string): Promise<ContactDto> {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId }, include: contactInclude });
    if (!contact) throw new NotFoundException('Contact not found');
    return toContactDto(contact);
  }

  /** Distinct tags with contact counts, for filters and audience pickers. */
  async listTags(tenantId: string): Promise<{ name: string; contacts: number }[]> {
    const tags = await this.prisma.tag.findMany({
      where: { tenantId },
      select: { name: true, _count: { select: { contacts: true } } },
      orderBy: { name: 'asc' },
    });
    return tags.map((t) => ({ name: t.name, contacts: t._count.contacts }));
  }

  async listLocations(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.contact.findMany({
      where: { tenantId, location: { not: null } },
      select: { location: true },
      distinct: ['location'],
      orderBy: { location: 'asc' },
    });
    return rows.map((r) => r.location!).filter(Boolean);
  }

  /** Streams every matching contact as CSV rows (used by the export endpoint). */
  async *exportRows(tenantId: string, query: Partial<ListContactsQuery>): AsyncGenerator<ContactDto[]> {
    const where = this.buildWhere(tenantId, query);
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.contact.findMany({
        where,
        include: contactInclude,
        orderBy: { id: 'asc' },
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) return;
      yield rows.map(toContactDto);
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < 1000) return;
    }
  }

  // ----------------------------------------------------------------- tags

  /** Finds-or-creates the named tags and returns name -> id. */
  private async ensureTags(tenantId: string, names: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) return new Map();
    await this.prisma.tag.createMany({ data: unique.map((name) => ({ tenantId, name })), skipDuplicates: true });
    const tags = await this.prisma.tag.findMany({ where: { tenantId, name: { in: unique } } });
    return new Map(tags.map((t) => [t.name, t.id]));
  }

  private async assertAssignee(tenantId: string, userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
    if (!user) throw new BadRequestException('assignedUserId must be a user in your organisation');
  }

  // ------------------------------------------------------------- mutations

  async create(tenantId: string, input: CreateContactRequest): Promise<ContactDto> {
    const waId = normalizeWaId(input.phone, input.defaultCountryCode);
    if (!waId) throw new BadRequestException('Enter a valid phone number including the country code');
    await this.assertAssignee(tenantId, input.assignedUserId);

    const existing = await this.prisma.contact.findUnique({ where: { tenantId_waId: { tenantId, waId } } });
    if (existing) throw new ConflictException('A contact with this phone number already exists');

    const tagIds = await this.ensureTags(tenantId, input.tags ?? []);
    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        waId,
        displayName: input.name,
        email: input.email || null,
        location: input.location || null,
        leadStatus: input.leadStatus ?? 'New',
        source: input.source ?? 'Manual',
        notes: input.notes ?? null,
        assignedUserId: input.assignedUserId ?? null,
        tags: { create: [...tagIds.values()].map((tagId) => ({ tagId })) },
      },
      include: contactInclude,
    });
    return toContactDto(contact);
  }

  async update(tenantId: string, id: string, input: UpdateContactRequest): Promise<ContactDto> {
    const current = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!current) throw new NotFoundException('Contact not found');
    await this.assertAssignee(tenantId, input.assignedUserId);

    let waId: string | undefined;
    if (input.phone !== undefined) {
      const normalized = normalizeWaId(input.phone, input.defaultCountryCode);
      if (!normalized) throw new BadRequestException('Enter a valid phone number including the country code');
      if (normalized !== current.waId) {
        const clash = await this.prisma.contact.findUnique({ where: { tenantId_waId: { tenantId, waId: normalized } } });
        if (clash) throw new ConflictException('Another contact already uses this phone number');
        waId = normalized;
      }
    }

    const tagIds = input.tags ? await this.ensureTags(tenantId, input.tags) : null;

    const contact = await this.prisma.$transaction(async (tx) => {
      if (tagIds) {
        await tx.contactTag.deleteMany({ where: { contactId: id } });
        if (tagIds.size) await tx.contactTag.createMany({ data: [...tagIds.values()].map((tagId) => ({ contactId: id, tagId })) });
      }
      return tx.contact.update({
        where: { id },
        data: {
          ...(waId ? { waId } : {}),
          ...(input.name !== undefined ? { displayName: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.location !== undefined ? { location: input.location || null } : {}),
          ...(input.leadStatus !== undefined ? { leadStatus: input.leadStatus } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
          ...(input.optedOut !== undefined
            ? { optedOut: input.optedOut, optedOutAt: input.optedOut ? new Date() : null }
            : {}),
        },
        include: contactInclude,
      });
    });
    return toContactDto(contact);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    const conversations = await this.prisma.conversation.count({ where: { tenantId, contactId: id } });
    if (conversations > 0) {
      throw new ConflictException(
        'This contact has conversation history and cannot be deleted. Mark them as opted out instead.',
      );
    }
    await this.prisma.contact.delete({ where: { id } });
  }

  /** Deletes many contacts; contacts that already have conversations are kept (returned in `blocked`). */
  async bulkRemove(tenantId: string, ids: string[]): Promise<{ deleted: number; blocked: number }> {
    const withHistory = await this.prisma.conversation.findMany({
      where: { tenantId, contactId: { in: ids } },
      select: { contactId: true },
      distinct: ['contactId'],
    });
    const blockedIds = new Set(withHistory.map((c) => c.contactId));
    const deletable = ids.filter((id) => !blockedIds.has(id));
    const result = await this.prisma.contact.deleteMany({ where: { tenantId, id: { in: deletable } } });
    return { deleted: result.count, blocked: blockedIds.size };
  }

  async bulkTag(tenantId: string, input: BulkTagRequest): Promise<{ affected: number }> {
    const owned = await this.prisma.contact.findMany({
      where: { tenantId, id: { in: input.contactIds } },
      select: { id: true },
    });
    const ids = owned.map((c) => c.id);
    if (ids.length === 0) return { affected: 0 };

    if (input.action === 'add') {
      const tagIds = await this.ensureTags(tenantId, [input.tag]);
      const tagId = tagIds.get(input.tag)!;
      await this.prisma.contactTag.createMany({ data: ids.map((contactId) => ({ contactId, tagId })), skipDuplicates: true });
    } else {
      const tag = await this.prisma.tag.findUnique({ where: { tenantId_name: { tenantId, name: input.tag } } });
      if (tag) await this.prisma.contactTag.deleteMany({ where: { tagId: tag.id, contactId: { in: ids } } });
    }
    return { affected: ids.length };
  }

  // ---------------------------------------------------------------- import

  async import(tenantId: string, input: ImportContactsRequest): Promise<ImportContactsResult> {
    const result: ImportContactsResult = { created: 0, updated: 0, skipped: 0, invalid: [] };

    // 1. Normalise + de-duplicate within the file (later rows win).
    type Row = { name?: string; email?: string; location?: string; leadStatus?: string; tags: string[]; line: number };
    const byWaId = new Map<string, Row>();
    input.rows.forEach((raw, index) => {
      const line = index + 1;
      const waId = normalizeWaId(raw.phone, input.defaultCountryCode);
      if (!waId) {
        result.invalid.push({ row: line, phone: raw.phone, reason: 'Invalid phone number' });
        return;
      }
      const email = raw.email?.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        result.invalid.push({ row: line, phone: raw.phone, reason: 'Invalid email address' });
        return;
      }
      if (byWaId.has(waId)) result.skipped += 1; // duplicate inside the file
      byWaId.set(waId, {
        name: raw.name || undefined,
        email: email || undefined,
        location: raw.location || undefined,
        leadStatus: raw.leadStatus || undefined,
        tags: [...(raw.tags ?? []), ...(input.tags ?? [])],
        line,
      });
    });
    if (byWaId.size === 0) return result;

    // 2. Split into new vs. existing numbers.
    const waIds = [...byWaId.keys()];
    const existing = await this.prisma.contact.findMany({
      where: { tenantId, waId: { in: waIds } },
      select: { id: true, waId: true, displayName: true },
    });
    const existingByWaId = new Map(existing.map((c) => [c.waId, c]));
    const toCreate = waIds.filter((w) => !existingByWaId.has(w));

    const allTagNames = [...byWaId.values()].flatMap((r) => r.tags);
    const tagIds = await this.ensureTags(tenantId, allTagNames);

    // 3. Create new contacts in one statement.
    if (toCreate.length) {
      await this.prisma.contact.createMany({
        data: toCreate.map((waId) => {
          const r = byWaId.get(waId)!;
          return {
            tenantId,
            waId,
            displayName: r.name ?? null,
            email: r.email ?? null,
            location: r.location ?? null,
            leadStatus: r.leadStatus ?? 'New',
            source: 'Import',
          };
        }),
        skipDuplicates: true,
      });
      result.created += toCreate.length;
    }

    // 4. Update existing contacts (only with values the file actually provides).
    if (input.updateExisting) {
      const updates = existing
        .map((c) => ({ c, r: byWaId.get(c.waId)! }))
        .filter(({ r }) => r.name || r.email || r.location || r.leadStatus);
      for (let i = 0; i < updates.length; i += 100) {
        await this.prisma.$transaction(
          updates.slice(i, i + 100).map(({ c, r }) =>
            this.prisma.contact.update({
              where: { id: c.id },
              data: {
                ...(r.name ? { displayName: r.name } : {}),
                ...(r.email ? { email: r.email } : {}),
                ...(r.location ? { location: r.location } : {}),
                ...(r.leadStatus ? { leadStatus: r.leadStatus } : {}),
              },
            }),
          ),
        );
      }
      result.updated += existing.length;
    } else {
      result.skipped += existing.length;
    }

    // 5. Attach tags to every row that was created or updated.
    const touched = await this.prisma.contact.findMany({
      where: { tenantId, waId: { in: input.updateExisting ? waIds : toCreate } },
      select: { id: true, waId: true },
    });
    const links = touched.flatMap((c) =>
      [...new Set(byWaId.get(c.waId)!.tags)]
        .map((name) => tagIds.get(name))
        .filter((tagId): tagId is string => !!tagId)
        .map((tagId) => ({ contactId: c.id, tagId })),
    );
    for (let i = 0; i < links.length; i += 5000) {
      await this.prisma.contactTag.createMany({ data: links.slice(i, i + 5000), skipDuplicates: true });
    }

    this.logger.log(
      `Imported contacts tenantId=${tenantId} created=${result.created} updated=${result.updated} skipped=${result.skipped} invalid=${result.invalid.length}`,
    );
    return result;
  }

  // ------------------------------------------------------ inbound handling

  /**
   * Called for every inbound WhatsApp message (after the inbox has stored it):
   * refreshes the contact's last interaction time and honours STOP / START
   * keywords so people can always opt out of campaigns by replying.
   */
  async handleInboundMessages(tenantId: string, messages: WebhookInboundMessage[]): Promise<void> {
    for (const msg of messages) {
      const waId = normalizeWaId(msg.from);
      if (!waId) continue;
      const at = new Date(Number(msg.timestamp) * 1000 || Date.now());
      const keyword = msg.type === 'text' ? (msg.text?.body ?? '').trim().toLowerCase().replace(/[.!]+$/, '') : '';

      const optOut = OPT_OUT_KEYWORDS.has(keyword);
      const optIn = OPT_IN_KEYWORDS.has(keyword);

      await this.prisma.contact.updateMany({
        where: { tenantId, waId },
        data: {
          lastInteractionAt: at,
          ...(optOut ? { optedOut: true, optedOutAt: new Date() } : {}),
          ...(optIn ? { optedOut: false, optedOutAt: null } : {}),
        },
      });
      if (optOut) this.logger.log(`Contact opted out via keyword tenantId=${tenantId} waId=${waId}`);
    }
  }
}
