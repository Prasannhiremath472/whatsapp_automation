import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Team-inbox endpoints used by the web app: enriched conversation list, message
 * text, mark-as-read, the 24-hour reply rule and template replies. Real MySQL
 * (DATABASE_URL) and the mock WhatsApp provider; WIPES every table: use a
 * throwaway database.
 */
jest.setTimeout(120_000);

describe('Inbox for the web app (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let adminA: string;
  let adminB: string;
  let tenantAId: string;
  let openConvId: string; // customer wrote 1 hour ago
  let staleConvId: string; // customer wrote 3 days ago
  let templateId: string;
  let paramTemplateId: string;

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

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

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

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@inbox2.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Inbox ${k}`, slug: `inbox2-${k}`, adminEmail: `admin@inbox2-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') tenantAId = res.body.tenant.id;
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@inbox2-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@inbox2-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);

    const connection = await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } });
    const seed = async (waId: string, name: string, lastInbound: Date) => {
      const contact = await prisma.contact.create({ data: { tenantId: tenantAId, waId, displayName: name } });
      const conv = await prisma.conversation.create({
        data: {
          tenantId: tenantAId,
          contactId: contact.id,
          whatsappConnectionId: connection.id,
          status: 'open',
          unreadCount: 2,
          lastMessageAt: lastInbound,
          windowExpiresAt: new Date(lastInbound.getTime() + 24 * 3600_000),
        },
      });
      await prisma.message.create({
        data: { tenantId: tenantAId, conversationId: conv.id, direction: 'inbound', senderType: 'customer', messageType: 'text', content: { body: `Hello from ${name}` }, status: 'delivered', createdAt: lastInbound },
      });
      return conv.id;
    };
    openConvId = await seed('919800000001', 'Priya', hoursAgo(1));
    staleConvId = await seed('919800000002', 'Rahul', hoursAgo(72));

    const tag = await prisma.tag.create({ data: { tenantId: tenantAId, name: 'VIP' } });
    const priya = await prisma.conversation.findUniqueOrThrow({ where: { id: openConvId } });
    await prisma.contactTag.create({ data: { contactId: priya.contactId, tagId: tag.id } });

    const mk = async (name: string, body: string) =>
      (await http().post(`${api}/message-templates`).set(auth(adminA)).send({ name, category: 'Marketing', language: 'en', body }).expect(201)).body.id as string;
    templateId = await mk('plain_reply', 'Hi, we are open 10 to 6.');
    paramTemplateId = await mk('param_reply', 'Hi {{1}}, your order {{2}} is ready.');
    for (const id of [templateId, paramTemplateId]) await http().post(`${api}/message-templates/${id}/submit`).set(auth(adminA)).expect(200);
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  it('lists conversations with the preview, agent, tags and window', async () => {
    const res = await http().get(`${api}/conversations`).set(auth(adminA)).expect(200);
    expect(res.body).toHaveLength(2);
    const priya = res.body.find((c: { id: string }) => c.id === openConvId);
    expect(priya).toMatchObject({
      status: 'open',
      unreadCount: 2,
      assignedAgent: null,
      contactTags: ['VIP'],
      lastMessage: { direction: 'inbound', messageType: 'text', preview: 'Hello from Priya' },
    });
    expect(priya.contact.displayName).toBe('Priya');
    expect(new Date(priya.windowExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body[0].id).toBe(openConvId); // most recent first
  });

  it('shows another business nothing', async () => {
    expect((await http().get(`${api}/conversations`).set(auth(adminB)).expect(200)).body).toEqual([]);
    await http().get(`${api}/conversations/${openConvId}/messages`).set(auth(adminB)).expect(404);
    await http().post(`${api}/conversations/${openConvId}/read`).set(auth(adminB)).expect(404);
    await http().post(`${api}/conversations/${openConvId}/template-messages`).set(auth(adminB)).send({ templateId }).expect(404);
  });

  it('returns messages with a plain-text rendering', async () => {
    const res = await http().get(`${api}/conversations/${openConvId}/messages`).set(auth(adminA)).expect(200);
    expect(res.body[0]).toMatchObject({ direction: 'inbound', text: 'Hello from Priya' });
  });

  it('marks a conversation read', async () => {
    await http().post(`${api}/conversations/${openConvId}/read`).set(auth(adminA)).expect(200);
    const res = await http().get(`${api}/conversations`).set(auth(adminA)).expect(200);
    expect(res.body.find((c: { id: string }) => c.id === openConvId).unreadCount).toBe(0);
    expect(res.body.find((c: { id: string }) => c.id === staleConvId).unreadCount).toBe(2);
  });

  it('allows a free-text reply inside the 24-hour window', async () => {
    const res = await http().post(`${api}/conversations/${openConvId}/messages`).set(auth(adminA)).send({ messageType: 'text', text: 'Hi Priya!' }).expect(201);
    expect(res.body).toMatchObject({ direction: 'outbound', senderType: 'agent', status: 'sent' });
    const list = await http().get(`${api}/conversations`).set(auth(adminA)).expect(200);
    expect(list.body.find((c: { id: string }) => c.id === openConvId).lastMessage.preview).toBe('Hi Priya!');
  });

  it('refuses free text after the window closed, but allows a template', async () => {
    const blocked = await http().post(`${api}/conversations/${staleConvId}/messages`).set(auth(adminA)).send({ messageType: 'text', text: 'Hello?' }).expect(409);
    expect(blocked.body.message).toMatch(/24-hour/);

    const sent = await http().post(`${api}/conversations/${staleConvId}/template-messages`).set(auth(adminA)).send({ templateId }).expect(201);
    expect(sent.body).toMatchObject({ messageType: 'template', direction: 'outbound', status: 'sent', content: { templateName: 'plain_reply', body: 'Hi, we are open 10 to 6.' } });
  });

  it('fills template variables and validates their number', async () => {
    const ok = await http().post(`${api}/conversations/${staleConvId}/template-messages`).set(auth(adminA)).send({ templateId: paramTemplateId, bodyVars: ['Rahul', '#42'] }).expect(201);
    expect(ok.body.content.body).toBe('Hi Rahul, your order #42 is ready.');
    const bad = await http().post(`${api}/conversations/${staleConvId}/template-messages`).set(auth(adminA)).send({ templateId: paramTemplateId, bodyVars: ['Rahul'] }).expect(400);
    expect(bad.body.message).toMatch(/2 value/);
  });

  it('only sends approved templates, and never to an opted-out contact', async () => {
    const draft = (await http().post(`${api}/message-templates`).set(auth(adminA)).send({ name: 'not_yet', category: 'Marketing', language: 'en', body: 'x' }).expect(201)).body.id;
    await http().post(`${api}/conversations/${openConvId}/template-messages`).set(auth(adminA)).send({ templateId: draft }).expect(400);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: staleConvId } });
    await prisma.contact.update({ where: { id: conv.contactId }, data: { optedOut: true } });
    const res = await http().post(`${api}/conversations/${staleConvId}/template-messages`).set(auth(adminA)).send({ templateId }).expect(400);
    expect(res.body.message).toMatch(/opted out/);
  });

  it('works out the window for older conversations that have none stored', async () => {
    const connection = await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } });
    const contact = await prisma.contact.create({ data: { tenantId: tenantAId, waId: '919800000003', displayName: 'Legacy' } });
    const conv = await prisma.conversation.create({
      data: { tenantId: tenantAId, contactId: contact.id, whatsappConnectionId: connection.id, status: 'open', lastMessageAt: hoursAgo(2) },
    });
    await prisma.message.create({
      data: { tenantId: tenantAId, conversationId: conv.id, direction: 'inbound', senderType: 'customer', messageType: 'text', content: { body: 'old chat' }, status: 'delivered', createdAt: hoursAgo(2) },
    });

    const list = await http().get(`${api}/conversations`).set(auth(adminA)).expect(200);
    const legacy = list.body.find((c: { id: string }) => c.id === conv.id);
    expect(new Date(legacy.windowExpiresAt).getTime()).toBeGreaterThan(Date.now()); // 2 h ago + 24 h
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).windowExpiresAt).not.toBeNull(); // saved
    await http().post(`${api}/conversations/${conv.id}/messages`).set(auth(adminA)).send({ messageType: 'text', text: 'Still open' }).expect(201);
  });

  it('reflects the status the agent sets and the assignee', async () => {
    const me = (await http().get(`${api}/auth/me`).set(auth(adminA)).expect(200)).body.user.id;
    await http().patch(`${api}/conversations/${openConvId}/assign`).set(auth(adminA)).send({ agentUserId: me }).expect(200);
    await http().patch(`${api}/conversations/${openConvId}/status`).set(auth(adminA)).send({ status: 'closed' }).expect(200);
    const list = await http().get(`${api}/conversations`).query({ status: 'closed' }).set(auth(adminA)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].assignedAgent).toMatchObject({ id: me });
  });
});
