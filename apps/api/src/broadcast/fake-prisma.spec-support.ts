/**
 * A tiny in-memory stand-in for the slice of PrismaClient that the campaign
 * dispatcher and tracker use. It exists so their state-machine logic (claiming,
 * retries, pause, counters, idempotency) can be unit-tested without MySQL.
 * It implements only the where-operators and methods those classes call —
 * it is deliberately not a general Prisma mock.
 */
type Row = Record<string, any>;

const isOperatorObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v);

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((w: Row) => matches(row, w));
    const value = row[key];
    if (!isOperatorObject(cond)) return value === cond;
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case 'in':
          return (arg as unknown[]).includes(value);
        case 'not':
          return value !== arg;
        case 'lt':
          return value != null && value < arg;
        case 'lte':
          return value != null && value <= arg;
        case 'gt':
          return value != null && value > arg;
        case 'gte':
          return value != null && value >= arg;
        default:
          throw new Error(`fake prisma: unsupported operator "${op}" on "${key}"`);
      }
    });
  });
}

function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (isOperatorObject(value) && ('increment' in value || 'decrement' in value)) {
      row[key] = (row[key] ?? 0) + (value.increment ?? 0) - (value.decrement ?? 0);
    } else if (isOperatorObject(value) && !(value instanceof Date) && Object.keys(value).length === 0) {
      row[key] = value; // empty JSON object
    } else {
      row[key] = value;
    }
  }
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${String(++counter).padStart(6, '0')}`;

export class FakeTable {
  rows: Row[] = [];
  constructor(
    private readonly name: string,
    private readonly db: FakePrisma,
    private readonly defaults: () => Row = () => ({}),
    private readonly uniqueKeys: string[][] = [],
  ) {}

  insert(row: Row): Row {
    const full: Row = { id: nextId(this.name), createdAt: new Date(), updatedAt: new Date(), ...this.defaults(), ...row };
    this.rows.push(full);
    return full;
  }

  private sorted(rows: Row[], orderBy?: Row | Row[]): Row[] {
    const order = orderBy ? (Array.isArray(orderBy) ? orderBy[0]! : orderBy) : null;
    if (!order) return rows;
    const [field, dir] = Object.entries(order)[0]!;
    return [...rows].sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  }

  /** Relations requested via `select: { relation: { select: ... } }` behave like includes. */
  private relations(args: Row): Row | undefined {
    if (args.include) return args.include;
    if (!args.select) return undefined;
    const rel = Object.fromEntries(Object.entries(args.select).filter(([, v]) => isOperatorObject(v)));
    return Object.keys(rel).length ? rel : undefined;
  }

  private withIncludes(row: Row, include?: Row): Row {
    if (!include) return row;
    const out = { ...row };
    for (const [relation, spec] of Object.entries(include)) {
      if (!spec) continue;
      if (relation === 'contact') out.contact = this.db.contact.rows.find((c) => c.id === row.contactId);
      else if (relation === 'campaign') out.campaign = this.db.broadcastCampaign.rows.find((c) => c.id === row.campaignId);
      else if (relation === 'template') out.template = this.db.messageTemplate.rows.find((t) => t.id === row.templateId);
      else throw new Error(`fake prisma: unsupported include "${relation}"`);
    }
    return out;
  }

  async findMany(args: Row = {}): Promise<Row[]> {
    let rows = this.sorted(this.rows.filter((r) => matches(r, args.where)), args.orderBy);
    if (args.cursor) {
      const at = rows.findIndex((r) => r.id === args.cursor.id);
      rows = rows.slice(at + (args.skip ?? 0));
    }
    if (args.take !== undefined) rows = rows.slice(0, args.take);
    return rows.map((r) => this.withIncludes(r, this.relations(args)));
  }

  async findUnique(args: Row): Promise<Row | null> {
    const row = this.rows.find((r) => matches(r, args.where));
    return row ? this.withIncludes(row, this.relations(args)) : null;
  }

  async findFirst(args: Row = {}): Promise<Row | null> {
    return (await this.findMany({ ...args, take: 1 }))[0] ?? null;
  }

  async create(args: Row): Promise<Row> {
    return this.insert(args.data);
  }

  async createMany(args: Row): Promise<{ count: number }> {
    let count = 0;
    for (const data of args.data as Row[]) {
      const duplicate = this.uniqueKeys.some((keys) => this.rows.some((r) => keys.every((k) => r[k] === data[k])));
      if (duplicate && args.skipDuplicates) continue;
      this.insert(data);
      count += 1;
    }
    return { count };
  }

  async update(args: Row): Promise<Row> {
    const row = this.rows.find((r) => matches(r, args.where));
    if (!row) throw new Error(`fake prisma: ${this.name}.update found no row for ${JSON.stringify(args.where)}`);
    applyData(row, args.data);
    row.updatedAt = new Date();
    return row;
  }

  async updateMany(args: Row): Promise<{ count: number }> {
    const hit = this.rows.filter((r) => matches(r, args.where));
    for (const row of hit) {
      applyData(row, args.data);
      row.updatedAt = new Date();
    }
    return { count: hit.length };
  }

  async delete(args: Row): Promise<Row> {
    const at = this.rows.findIndex((r) => matches(r, args.where));
    if (at < 0) throw new Error(`fake prisma: ${this.name}.delete found no row for ${JSON.stringify(args.where)}`);
    return this.rows.splice(at, 1)[0]!;
  }

  async deleteMany(args: Row = {}): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, args.where));
    return { count: before - this.rows.length };
  }

  async count(args: Row = {}): Promise<number> {
    return this.rows.filter((r) => matches(r, args.where)).length;
  }

  async groupBy(args: Row): Promise<Row[]> {
    const field = (args.by as string[])[0]!;
    const groups = new Map<unknown, number>();
    for (const row of this.rows.filter((r) => matches(r, args.where))) groups.set(row[field], (groups.get(row[field]) ?? 0) + 1);
    return [...groups].map(([value, n]) => ({ [field]: value, _count: { _all: n } }));
  }
}

export class FakePrisma {
  broadcastCampaign = new FakeTable('camp', this, () => ({
    status: 'draft',
    totalRecipients: 0,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0,
    skippedCount: 0,
    dispatcherLockedUntil: null,
    materializedAt: null,
    startedAt: new Date(),
    statusReason: null,
    headerMediaUrl: null,
    audience: { mode: 'all', tags: [], contactIds: [] },
    variableMapping: { header: [], body: [] },
  }));
  broadcastRecipient = new FakeTable(
    'rcpt',
    this,
    () => ({ status: 'pending', attempts: 0, errorCode: null, errorDetail: null, waMessageId: null, messageId: null, sentAt: null, deliveredAt: null, readAt: null }),
    [['campaignId', 'contactId']],
  );
  messageTemplate = new FakeTable('tpl', this);
  whatsappConnection = new FakeTable('conn', this);
  contact = new FakeTable('contact', this, () => ({ optedOut: false, displayName: null, profileName: null, email: null, location: null }));
  conversation = new FakeTable('conv', this);
  message = new FakeTable('msg', this);
  webhookEvent = new FakeTable('evt', this, () => ({ status: 'pending', attempts: 0, runAfter: new Date(), lockedUntil: null, lastError: null, payload: {} }));
}
