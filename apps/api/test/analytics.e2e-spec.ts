import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * GET /analytics/overview against seeded data. Real MySQL (DATABASE_URL);
 * WIPES every table: use a throwaway database.
 */
jest.setTimeout(120_000);

describe('Analytics overview (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let adminA: string;
  let adminB: string;

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

  async function wipe() {
    await prisma.broadcastRecipient.deleteMany();
    await prisma.broadcastCampaign.deleteMany();
    await prisma.messageTemplate.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contactTag.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  }

  beforeAll(async () => {
    process.env.WHATSAPP_MODE = 'mock';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@an.local', password: 'password123', displayName: 'Super' }).expect(201);
    let tenantAId = '';
    let adminAUserId = '';
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `An ${k}`, slug: `an-${k}`, adminEmail: `admin@an-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') {
        tenantAId = res.body.tenant.id;
        adminAUserId = res.body.admin.id;
      }
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@an-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@an-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
    const connection = await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } });

    const contact = await prisma.contact.create({ data: { tenantId: tenantAId, waId: '919811111111', displayName: 'Priya' } });
    await prisma.contact.create({ data: { tenantId: tenantAId, waId: '919822222222', displayName: 'Opted', optedOut: true } });
    await prisma.contact.create({ data: { tenantId: tenantAId, waId: '919833333333', displayName: 'Old', createdAt: hoursAgo(24 * 40) } });
    const conv = await prisma.conversation.create({
      data: { tenantId: tenantAId, contactId: contact.id, whatsappConnectionId: connection.id, status: 'open', unreadCount: 1, createdAt: hoursAgo(3) },
    });
    const msg = (direction: 'inbound' | 'outbound', senderType: 'customer' | 'agent' | 'bot' | 'system', status: 'sent' | 'delivered' | 'read' | 'failed', createdAt: Date | number) =>
      prisma.message.create({
        data: { tenantId: tenantAId, conversationId: conv.id, direction, senderType, messageType: 'text', content: { body: 'x' }, status, createdAt: new Date(createdAt) },
      });
    const t0 = hoursAgo(2).getTime();
    await msg('inbound', 'customer', 'delivered', t0); // customer writes
    await msg('outbound', 'agent', 'read', t0 + 90_000); // a person answers after 90 s
    await msg('outbound', 'bot', 'delivered', t0 + 30_000); // a bot reply does not count as a human response
    await msg('outbound', 'system', 'sent', t0 + 100_000);
    await msg('outbound', 'system', 'failed', t0 + 110_000);
    await msg('outbound', 'system', 'read', hoursAgo(24 * 10).getTime()); // outside the 7-day range

    const tpl = await prisma.messageTemplate.create({
      data: { tenantId: tenantAId, name: 'promo', category: 'Marketing', language: 'en', body: 'hi', status: 'approved' },
    });
    await prisma.broadcastCampaign.create({
      data: {
        tenantId: tenantAId, templateId: tpl.id, name: 'Diwali', status: 'running', audience: { mode: 'all' }, createdByUserId: adminAUserId,
        totalRecipients: 100, sentCount: 80, deliveredCount: 70, readCount: 40, failedCount: 5,
      },
    });
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  it('requires login and a valid range', async () => {
    await http().get(`${api}/analytics/overview`).expect(401);
    await http().get(`${api}/analytics/overview`).query({ range: 'forever' }).set(auth(adminA)).expect(400);
  });

  it('summarises messages, conversations, contacts and campaigns for the last 7 days', async () => {
    const { body } = await http().get(`${api}/analytics/overview`).query({ range: '7d' }).set(auth(adminA)).expect(200);

    expect(body.range).toBe('7d');
    expect(body.messages).toMatchObject({
      inbound: 1,
      failed: 1,
      sent: 3, // read + delivered(bot) + sent(system); the failed one is not counted
      delivered: 2, // read counts as delivered
      read: 1,
      previousSent: 1, // the old read message sits in the previous 7 days
    });
    expect(body.conversations).toMatchObject({ started: 1, open: 1, unread: 1 });
    expect(body.conversations.avgFirstResponseSeconds).toBe(90);
    expect(body.contacts).toMatchObject({ total: 3, new: 2, optedOut: 1 });
    expect(body.campaigns).toMatchObject({ total: 1, running: 1 });
    expect(body.campaigns.recent[0]).toMatchObject({ name: 'Diwali', total: 100, sent: 80, delivered: 70, read: 40, failed: 5 });
  });

  it('returns one row per day, with totals that match', async () => {
    const { body } = await http().get(`${api}/analytics/overview`).query({ range: '7d' }).set(auth(adminA)).expect(200);
    expect(body.daily).toHaveLength(7);
    expect(body.daily.reduce((n: number, d: { inbound: number }) => n + d.inbound, 0)).toBe(1);
    expect(body.daily.reduce((n: number, d: { outbound: number }) => n + d.outbound, 0)).toBe(4); // includes the failed one
    expect(body.daily.reduce((n: number, d: { newContacts: number }) => n + d.newContacts, 0)).toBe(2);
    const dates = body.daily.map((d: { date: string }) => d.date);
    expect([...dates].sort()).toEqual(dates);

    const today = await http().get(`${api}/analytics/overview`).query({ range: 'today' }).set(auth(adminA)).expect(200);
    expect(today.body.daily).toHaveLength(1);
    const ninety = await http().get(`${api}/analytics/overview`).query({ range: '90d' }).set(auth(adminA)).expect(200);
    expect(ninety.body.daily).toHaveLength(90);
    expect(ninety.body.contacts.new).toBe(3); // the 40-day-old contact is now in range
  });

  it('shows another business only its own (empty) numbers', async () => {
    const { body } = await http().get(`${api}/analytics/overview`).query({ range: '90d' }).set(auth(adminB)).expect(200);
    expect(body.messages).toMatchObject({ sent: 0, inbound: 0, failed: 0 });
    expect(body.contacts.total).toBe(0);
    expect(body.campaigns).toMatchObject({ total: 0, recent: [] });
    expect(body.conversations.avgFirstResponseSeconds).toBeNull();
  });
});
