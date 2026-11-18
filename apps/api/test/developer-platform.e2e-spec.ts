import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { InboxService } from '../src/inbox/inbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashApiKey } from '../src/developer/api-keys.service';

/**
 * API keys, the public API (/public/v1), request logs and support tickets.
 * Real MySQL (DATABASE_URL), mock WhatsApp provider; WIPES every table: use a
 * throwaway database.
 */
jest.setTimeout(180_000);

describe('Developer platform & support (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: InboxService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const pub = '/public/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = (k: string) => ({ Authorization: `Bearer ${k}` });

  let adminA: string;
  let adminB: string;
  let agentA: string;
  let tenantAId: string;
  let connectionId: string;
  let fullKey: string;
  let fullKeyId: string;
  let readOnlyKey: string;
  let keyB: string;
  let seq = 0;

  async function wipe() {
    await prisma.apiRequestLog.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.supportTicketMessage.deleteMany();
    await prisma.supportTicket.deleteMany();
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
  const createKey = async (token: string, name: string, scopes: string[], extra: Record<string, unknown> = {}) =>
    (await http().post(`${api}/api-keys`).set(auth(token)).send({ name, scopes, ...extra }).expect(201)).body;
  const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms)); // request logs are written after the response

  beforeAll(async () => {
    process.env.WHATSAPP_MODE = 'mock';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    inbox = app.get(InboxService);
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@dev.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Dev ${k}`, slug: `dev-${k}`, adminEmail: `admin@dev-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') tenantAId = res.body.tenant.id;
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@dev-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@dev-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/users`).set(auth(adminA)).send({ email: 'agent@dev-a.local', password: 'password123', displayName: 'Agent', role: 'agent' }).expect(201);
    agentA = (await http().post(`${api}/auth/login`).send({ email: 'agent@dev-a.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
    connectionId = (await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } })).id;

    for (const [name, body] of [['order_update', 'Hi {{1}}, order {{2}} shipped.'], ['hello_plain', 'Hello from us!']] as const) {
      const id = (await http().post(`${api}/message-templates`).set(auth(adminA)).send({ name, category: 'Marketing', language: 'en', body }).expect(201)).body.id;
      await http().post(`${api}/message-templates/${id}/submit`).set(auth(adminA)).expect(200);
    }
    await http().post(`${api}/message-templates`).set(auth(adminA)).send({ name: 'unapproved', category: 'Marketing', language: 'en', body: 'x' }).expect(201); // draft
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  describe('API keys', () => {
    it('shows the secret once and stores only its hash', async () => {
      const created = await createKey(adminA, 'Backend', ['messages:send', 'messages:read', 'contacts:read', 'contacts:write', 'templates:read']);
      fullKey = created.secret;
      fullKeyId = created.id;
      expect(fullKey).toMatch(/^gk_live_[A-Za-z0-9]{32}$/);
      expect(created.prefix).toBe(fullKey.slice(0, 16));
      const list = (await http().get(`${api}/api-keys`).set(auth(adminA)).expect(200)).body;
      expect(JSON.stringify(list)).not.toContain(fullKey);
      const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: fullKeyId } });
      expect(row.keyHash).toBe(hashApiKey(fullKey));
      expect(JSON.stringify(row)).not.toContain(fullKey);
    });

    it('validates input and is for business admins only', async () => {
      await http().post(`${api}/api-keys`).set(auth(adminA)).send({ name: 'x', scopes: [] }).expect(400);
      await http().post(`${api}/api-keys`).set(auth(adminA)).send({ name: 'x', scopes: ['root'] }).expect(400);
      await http().post(`${api}/api-keys`).set(auth(agentA)).send({ name: 'x', scopes: ['messages:send'] }).expect(403);
      await http().get(`${api}/api-keys`).set(auth(agentA)).expect(403);
      expect((await http().get(`${api}/api-keys`).set(auth(adminB)).expect(200)).body).toEqual([]);
    });

    it('revokes a key permanently', async () => {
      const tmp = await createKey(adminA, 'Temp', ['templates:read']);
      await http().get(`${pub}/templates`).set(key(tmp.secret)).expect(200);
      await http().delete(`${api}/api-keys/${tmp.id}`).set(auth(adminA)).expect(200);
      await http().get(`${pub}/templates`).set(key(tmp.secret)).expect(401);
      await http().delete(`${api}/api-keys/${tmp.id}`).set(auth(adminB)).expect(404);
    });
  });

  describe('Authentication and permissions', () => {
    it('rejects missing, malformed, unknown and expired keys', async () => {
      await http().get(`${pub}/templates`).expect(401);
      await http().get(`${pub}/templates`).set(key('hello')).expect(401);
      await http().get(`${pub}/templates`).set(key('gk_live_' + 'x'.repeat(32))).expect(401);
      await http().get(`${pub}/templates`).set(auth(adminA)).expect(401); // a login token is not an API key
      const short = await createKey(adminA, 'Short lived', ['templates:read'], { expiresInDays: 1 });
      await http().get(`${pub}/templates`).set(key(short.secret)).expect(200);
      await prisma.apiKey.update({ where: { id: short.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().get(`${pub}/templates`).set(key(short.secret)).expect(401);
    });

    it('also accepts the X-API-Key header', async () => {
      await http().get(`${pub}/templates`).set('X-API-Key', fullKey).expect(200);
    });

    it('enforces scopes', async () => {
      const ro = await createKey(adminA, 'Read only', ['contacts:read']);
      readOnlyKey = ro.secret;
      await http().get(`${pub}/contacts`).set(key(readOnlyKey)).expect(200);
      const denied = await http().post(`${pub}/messages`).set(key(readOnlyKey)).send({ to: '+919800000000', type: 'text', text: 'hi' }).expect(403);
      expect(denied.body.message).toMatch(/messages:send/);
      await http().post(`${pub}/contacts`).set(key(readOnlyKey)).send({ phone: '+919800000000' }).expect(403);
    });

    it('serves the OpenAPI description without a key', async () => {
      const res = await http().get(`${pub}/openapi.json`).expect(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/public/v1/messages', '/public/v1/contacts', '/public/v1/templates', '/public/v1/messages/{id}']));
    });
  });

  describe('Public API', () => {
    it('lists only approved templates', async () => {
      const res = await http().get(`${pub}/templates`).set(key(fullKey)).expect(200);
      expect(res.body.map((t: { name: string }) => t.name)).toEqual(['hello_plain', 'order_update']);
      expect(res.body.find((t: { name: string }) => t.name === 'order_update').variableCount).toBe(2);
    });

    it('creates then updates a contact, merging tags', async () => {
      const created = await http().post(`${pub}/contacts`).set(key(fullKey)).send({ phone: '98200 11122', defaultCountryCode: '91', name: 'Priya', email: 'priya@x.test', tags: ['lead'] }).expect(201);
      expect(created.body).toMatchObject({ phone: '919820011122', name: 'Priya', source: 'API', tags: ['lead'] });
      const updated = await http().post(`${pub}/contacts`).set(key(fullKey)).send({ phone: '+91 98200 11122', tags: ['vip'] }).expect(200);
      expect(updated.body.tags.sort()).toEqual(['lead', 'vip']);
      expect(updated.body.name).toBe('Priya');
      await http().post(`${pub}/contacts`).set(key(fullKey)).send({ phone: 'abc' }).expect(400);

      const list = await http().get(`${pub}/contacts`).query({ q: 'Priya' }).set(key(fullKey)).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.meta.total).toBe(1);
    });

    it('sends a template and reports its status', async () => {
      const sent = await http().post(`${pub}/messages`).set(key(fullKey)).send({
        to: '+91 98765 43210', defaultCountryCode: '91', type: 'template', template: { name: 'order_update', language: 'en', variables: ['Asha', '#1042'] },
      }).expect(201);
      expect(sent.body).toMatchObject({ to: '+919876543210', type: 'template', status: 'sent' });
      const stored = await prisma.message.findUniqueOrThrow({ where: { id: sent.body.id } });
      expect((stored.content as { body: string }).body).toBe('Hi Asha, order #1042 shipped.');

      const status = await http().get(`${pub}/messages/${sent.body.id}`).set(key(fullKey)).expect(200);
      expect(status.body).toMatchObject({ id: sent.body.id, status: 'sent', to: '+919876543210' });
      const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: tenantAId, waId: '919876543210' } });
      expect(contact.source).toBe('API');
    });

    it('explains what is wrong with a bad send', async () => {
      const send = (body: unknown) => http().post(`${pub}/messages`).set(key(fullKey)).send(body as object);
      await send({ to: '+919876543210', type: 'template', template: { name: 'order_update', variables: ['only one'] } }).expect(400);
      await send({ to: '+919876543210', type: 'template', template: { name: 'unapproved' } }).expect(404);
      await send({ to: '+919876543210', type: 'template', template: { name: 'nope' } }).expect(404);
      await send({ to: 'not-a-number', type: 'text', text: 'hi' }).expect(400);
      await send({ to: '+919876543210', type: 'email' }).expect(400);
      const closed = await send({ to: '+919800099999', type: 'text', text: 'hello' }).expect(422);
      expect(closed.body.message).toMatch(/24-hour/);
    });

    it('allows free text inside the 24-hour window and refuses opted-out contacts', async () => {
      seq += 1;
      await inbox.ingestInboundMessage(tenantAId, connectionId, {
        messaging_product: 'whatsapp', metadata: { phone_number_id: 'mock-phone' }, contacts: [{ wa_id: '919811100001', profile: { name: 'Neha' } }],
        messages: [{ from: '919811100001', id: `wamid.pub-${Date.now()}-${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'hi' } }],
      });
      const sent = await http().post(`${pub}/messages`).set(key(fullKey)).send({ to: '+919811100001', type: 'text', text: 'Thanks for writing!' }).expect(201);
      expect(sent.body.status).toBe('sent');

      await prisma.contact.update({ where: { tenantId_waId: { tenantId: tenantAId, waId: '919811100001' } }, data: { optedOut: true } });
      const blocked = await http().post(`${pub}/messages`).set(key(fullKey)).send({ to: '+919811100001', type: 'text', text: 'again' }).expect(422);
      expect(blocked.body.message).toMatch(/opted out/);
    });

    it('keeps each business inside its own data', async () => {
      const b = await createKey(adminB, 'B backend', ['messages:read', 'contacts:read', 'templates:read', 'messages:send']);
      keyB = b.secret;
      expect((await http().get(`${pub}/templates`).set(key(keyB)).expect(200)).body).toEqual([]);
      expect((await http().get(`${pub}/contacts`).set(key(keyB)).expect(200)).body.data).toEqual([]);
      const aMessage = await prisma.message.findFirstOrThrow({ where: { tenantId: tenantAId, direction: 'outbound' } });
      await http().get(`${pub}/messages/${aMessage.id}`).set(key(keyB)).expect(404);
      await http().post(`${pub}/messages`).set(key(keyB)).send({ to: '+919876543210', type: 'template', template: { name: 'hello_plain' } }).expect(409); // B has no WhatsApp number
    });
  });

  describe('Request log', () => {
    it('records calls with status and the key used, never their content', async () => {
      await settle();
      const logs = (await http().get(`${api}/api-logs`).query({ pageSize: 100 }).set(auth(adminA)).expect(200)).body;
      expect(logs.total).toBeGreaterThan(10);
      const first = logs.items.find((l: { method: string; path: string; status: number }) => l.method === 'POST' && l.path === '/public/v1/messages' && l.status === 201);
      expect(first).toMatchObject({ apiKeyName: 'Backend' });
      expect(JSON.stringify(logs)).not.toContain('Thanks for writing');
      expect(JSON.stringify(logs)).not.toContain(fullKey);
      const failedScope = logs.items.find((l: { status: number; error: string }) => l.status === 403);
      expect(failedScope.error).toMatch(/Missing scope/);
    });

    it('filters errors, summarises 24 hours and updates key usage', async () => {
      const errors = (await http().get(`${api}/api-logs`).query({ status: 'error' }).set(auth(adminA)).expect(200)).body;
      expect(errors.items.length).toBeGreaterThan(0);
      expect(errors.items.every((l: { status: number }) => l.status >= 400)).toBe(true);
      const summary = (await http().get(`${api}/api-logs/summary`).set(auth(adminA)).expect(200)).body;
      expect(summary.requests).toBeGreaterThan(10);
      expect(summary.errors).toBeGreaterThan(0);
      const key = (await http().get(`${api}/api-keys`).set(auth(adminA)).expect(200)).body.find((k: { id: string }) => k.id === fullKeyId);
      expect(key.requestCount).toBeGreaterThan(5);
      expect(key.lastUsedAt).not.toBeNull();
    });

    it('is private to the business and its admins', async () => {
      expect((await http().get(`${api}/api-logs`).set(auth(adminB)).expect(200)).body.items.every((l: { apiKeyName: string | null }) => l.apiKeyName !== 'Backend')).toBe(true);
      await http().get(`${api}/api-logs`).set(auth(agentA)).expect(403);
    });
  });

  describe('Rate limit', () => {
    it('stops a key after 120 requests a minute and says when to retry', async () => {
      const burst = await createKey(adminA, 'Burst', ['templates:read']);
      let limited: request.Response | null = null;
      for (let i = 0; i < 125 && !limited; i += 1) {
        const res = await http().get(`${pub}/templates`).set(key(burst.secret));
        if (res.status === 429) limited = res;
        else expect(res.status).toBe(200);
      }
      expect(limited).not.toBeNull();
      expect(Number(limited!.headers['retry-after'])).toBeGreaterThan(0);
      expect(limited!.body.message).toMatch(/Rate limit/);
      await http().get(`${pub}/templates`).set(key(fullKey)).expect(200); // other keys are unaffected
    });
  });

  describe('Support tickets', () => {
    let ticketId: string;

    it('opens a ticket with a first message', async () => {
      await http().post(`${api}/support/tickets`).set(auth(agentA)).send({ subject: 'x', category: 'Billing', message: 'short' }).expect(400);
      const created = await http().post(`${api}/support/tickets`).set(auth(agentA)).send({ subject: 'Template stuck in review', category: 'Templates', priority: 'high', message: 'My template has been pending for two days.' }).expect(201);
      ticketId = created.body.id;
      expect(created.body).toMatchObject({ status: 'open', priority: 'high', createdByName: 'Agent' });
      expect(created.body.messages).toHaveLength(1);
      expect(created.body.messages[0]).toMatchObject({ authorType: 'customer', authorName: 'Agent' });
    });

    it('is shared inside the business, and invisible to others', async () => {
      expect((await http().get(`${api}/support/tickets`).set(auth(adminA)).expect(200)).body).toHaveLength(1);
      expect((await http().get(`${api}/support/tickets`).set(auth(adminB)).expect(200)).body).toEqual([]);
      await http().get(`${api}/support/tickets/${ticketId}`).set(auth(adminB)).expect(404);
      await http().post(`${api}/support/tickets/${ticketId}/messages`).set(auth(adminB)).send({ message: 'hi' }).expect(404);
      await http().post(`${api}/support/tickets/${ticketId}/close`).set(auth(adminB)).expect(404);
    });

    it('takes replies, closes, and reopens on a new reply', async () => {
      const replied = await http().post(`${api}/support/tickets/${ticketId}/messages`).set(auth(adminA)).send({ message: 'Any update?' }).expect(201);
      expect(replied.body.messages).toHaveLength(2);
      expect((await http().post(`${api}/support/tickets/${ticketId}/close`).set(auth(adminA)).expect(200)).body.status).toBe('closed');
      expect((await http().get(`${api}/support/tickets`).query({ status: 'open' }).set(auth(adminA)).expect(200)).body).toHaveLength(0);
      const reopened = await http().post(`${api}/support/tickets/${ticketId}/messages`).set(auth(adminA)).send({ message: 'It happened again.' }).expect(201);
      expect(reopened.body.status).toBe('open');
    });
  });
});
