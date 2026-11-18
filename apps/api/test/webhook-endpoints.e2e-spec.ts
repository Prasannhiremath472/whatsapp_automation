import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { InboxService } from '../src/inbox/inbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebhookDeliveryWorker } from '../src/webhook-endpoints/webhook-delivery.worker';

/**
 * Outgoing webhooks end to end: subscriptions, signed deliveries, retries,
 * the delivery log and isolation. The receiver is a spy on axios.post (no
 * network). Real MySQL (DATABASE_URL); WIPES every table: use a throwaway DB.
 */
jest.setTimeout(120_000);

describe('Outgoing webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: InboxService;
  let worker: WebhookDeliveryWorker;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let adminA: string;
  let adminB: string;
  let tenantAId: string;
  let connectionId: string;
  let seq = 0;

  const post = jest.spyOn(axios, 'post');
  let receiverStatus = 200;

  async function wipe() {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhookEndpoint.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  }
  async function customerSays(waId: string, text: string) {
    seq += 1;
    await inbox.ingestInboundMessage(tenantAId, connectionId, {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: 'mock-phone' },
      contacts: [{ wa_id: waId, profile: { name: 'Priya' } }],
      messages: [{ from: waId, id: `wamid.wh-${Date.now()}-${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    });
  }
  async function eventually<T>(check: () => Promise<T | false | null | undefined>, what: string, timeoutMs = 15_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
      await new Promise((r) => setTimeout(r, 150));
    }
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
    inbox = app.get(InboxService);
    worker = app.get(WebhookDeliveryWorker);
    await wipe();

    post.mockImplementation((async () => ({ status: receiverStatus, data: {} })) as never);

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@wh.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Hooks ${k}`, slug: `wh-${k}`, adminEmail: `admin@wh-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') tenantAId = res.body.tenant.id;
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@wh-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@wh-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
    connectionId = (await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } })).id;
    await prisma.whatsappConnection.update({ where: { id: connectionId }, data: { phoneNumberId: 'mock-phone' } });
  });

  afterAll(async () => {
    post.mockRestore();
    await wipe();
    await app.close();
  });

  const body = { name: 'Zapier', url: 'https://203.0.113.10/hooks/genie', events: ['message.received', 'conversation.created'], active: true };
  let endpointId: string;
  let secret: string;

  it('rejects unsafe or invalid destinations', async () => {
    await http().post(`${api}/webhook-endpoints`).set(auth(adminA)).send({ ...body, url: 'http://203.0.113.10/x' }).expect(400);
    for (const url of ['https://127.0.0.1/x', 'https://localhost/x', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/x', 'https://[::1]/x']) {
      const res = await http().post(`${api}/webhook-endpoints`).set(auth(adminA)).send({ ...body, url }).expect(400);
      expect(res.body.message).toMatch(/public|Local/);
    }
    await http().post(`${api}/webhook-endpoints`).set(auth(adminA)).send({ ...body, events: [] }).expect(400);
    await http().post(`${api}/webhook-endpoints`).set(auth(adminA)).send({ ...body, events: ['everything'] }).expect(400);
  });

  it('shows the signing secret once and stores it encrypted', async () => {
    const created = await http().post(`${api}/webhook-endpoints`).set(auth(adminA)).send(body).expect(201);
    endpointId = created.body.id;
    secret = created.body.secret;
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    const list = (await http().get(`${api}/webhook-endpoints`).set(auth(adminA)).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(secret);
    expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } })).secretCipher).not.toContain(secret);
  });

  it('delivers a signed event when a customer writes in', async () => {
    post.mockClear();
    await customerSays('919833330001', 'Hello from a customer');
    await eventually(async () => (await prisma.webhookDelivery.count({ where: { endpointId } })) >= 2, 'deliveries queued');
    const queued = await prisma.webhookDelivery.findMany({ where: { endpointId }, orderBy: { createdAt: 'asc' } });
    expect(queued.map((d) => d.event).sort()).toEqual(['conversation.created', 'message.received']);

    await worker.tick();
    const received = post.mock.calls.map(([url, raw, config]) => ({ url, raw: raw as string, headers: (config as { headers: Record<string, string> }).headers }));
    expect(received).toHaveLength(2);
    const msgEvent = received.find((r) => r.headers['x-genie-event'] === 'message.received')!;
    expect(msgEvent.url).toBe('https://203.0.113.10/hooks/genie');
    const payload = JSON.parse(msgEvent.raw);
    expect(payload).toMatchObject({ event: 'message.received', data: { message: { type: 'text', text: 'Hello from a customer' }, contact: { phone: '+919833330001', name: 'Priya' } } });

    // The receiver can verify the signature with the secret it was given.
    const parts = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(msgEvent.headers['x-genie-signature'])!;
    expect(parts).toBeTruthy();
    expect(createHmac('sha256', secret).update(`${parts[1]}.${msgEvent.raw}`).digest('hex')).toBe(parts[2]);

    const log = (await http().get(`${api}/webhook-endpoints/${endpointId}/deliveries`).set(auth(adminA)).expect(200)).body;
    expect(log.every((d: { status: string; responseStatus: number }) => d.status === 'success' && d.responseStatus === 200)).toBe(true);
    expect((await http().get(`${api}/webhook-endpoints`).set(auth(adminA)).expect(200)).body[0].lastStatus).toBe('success');
  });

  it('only sends the events the endpoint subscribed to', async () => {
    post.mockClear();
    const before = await prisma.webhookDelivery.count({ where: { endpointId } });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { tenantId: tenantAId } });
    await http().post(`${api}/conversations/${conv.id}/messages`).set(auth(adminA)).send({ messageType: 'text', text: 'Reply from the team' }).expect(201); // message.status: not subscribed
    await new Promise((r) => setTimeout(r, 600));
    expect(await prisma.webhookDelivery.count({ where: { endpointId } })).toBe(before);

    await http().put(`${api}/webhook-endpoints/${endpointId}`).set(auth(adminA)).send({ ...body, events: ['message.status'] }).expect(200);
    await http().post(`${api}/conversations/${conv.id}/messages`).set(auth(adminA)).send({ messageType: 'text', text: 'Second reply' }).expect(201);
    await eventually(async () => (await prisma.webhookDelivery.count({ where: { endpointId, event: 'message.status' } })) >= 1, 'status event queued');
    await worker.tick();
    const statusCall = post.mock.calls.find(([, , c]) => (c as { headers: Record<string, string> }).headers['x-genie-event'] === 'message.status');
    expect(JSON.parse(statusCall![1] as string).data.message).toMatchObject({ text: 'Second reply' });
  });

  it('retries with a delay when the receiver fails, then records the error', async () => {
    await http().post(`${api}/webhook-endpoints/${endpointId}/test`).set(auth(adminA)).expect(202);
    receiverStatus = 500;
    await worker.tick();
    const pending = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId, event: 'ping' }, orderBy: { createdAt: 'desc' } });
    expect(pending).toMatchObject({ status: 'pending', attempts: 1, responseStatus: 500 });
    expect(pending.error).toMatch(/HTTP 500/);
    expect(pending.runAfter.getTime()).toBeGreaterThan(Date.now() + 30_000); // the first retry is about a minute away
    expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } })).consecutiveFails).toBe(1);

    post.mockClear();
    await worker.tick(); // not due yet
    expect(post).not.toHaveBeenCalled();

    receiverStatus = 200;
    await prisma.webhookDelivery.update({ where: { id: pending.id }, data: { runAfter: new Date(Date.now() - 1000) } });
    await worker.tick();
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'success', attempts: 2 });
    expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } })).consecutiveFails).toBe(0);
  });

  it('gives up after the last retry', async () => {
    receiverStatus = 500;
    const d = await prisma.webhookDelivery.create({
      data: { endpointId, tenantId: tenantAId, event: 'ping', payload: { event: 'ping' }, attempts: 5 },
    });
    await worker.tick();
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ status: 'failed', attempts: 6 });
    receiverStatus = 200;
  });

  it('rotates the secret (the old one stops working) and can be switched off', async () => {
    const rotated = await http().post(`${api}/webhook-endpoints/${endpointId}/rotate-secret`).set(auth(adminA)).expect(200);
    expect(rotated.body.secret).toMatch(/^whsec_/);
    expect(rotated.body.secret).not.toBe(secret);

    await http().put(`${api}/webhook-endpoints/${endpointId}`).set(auth(adminA)).send({ ...body, active: false }).expect(200);
    const before = await prisma.webhookDelivery.count({ where: { endpointId } });
    await customerSays('919833330002', 'nobody is listening');
    await new Promise((r) => setTimeout(r, 600));
    expect(await prisma.webhookDelivery.count({ where: { endpointId } })).toBe(before);
  });

  it('keeps one business\'s webhooks away from another and from agents', async () => {
    expect((await http().get(`${api}/webhook-endpoints`).set(auth(adminB)).expect(200)).body).toEqual([]);
    await http().put(`${api}/webhook-endpoints/${endpointId}`).set(auth(adminB)).send(body).expect(404);
    await http().post(`${api}/webhook-endpoints/${endpointId}/test`).set(auth(adminB)).expect(404);
    await http().get(`${api}/webhook-endpoints/${endpointId}/deliveries`).set(auth(adminB)).expect(404);
    await http().delete(`${api}/webhook-endpoints/${endpointId}`).set(auth(adminB)).expect(404);

    await http().post(`${api}/users`).set(auth(adminA)).send({ email: 'agent@wh-a.local', password: 'password123', displayName: 'Agent', role: 'agent' }).expect(201);
    const agent = (await http().post(`${api}/auth/login`).send({ email: 'agent@wh-a.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().get(`${api}/webhook-endpoints`).set(auth(agent)).expect(403);
  });

  it('deletes an endpoint with its delivery log', async () => {
    await http().delete(`${api}/webhook-endpoints/${endpointId}`).set(auth(adminA)).expect(204);
    expect(await prisma.webhookDelivery.count({ where: { endpointId } })).toBe(0);
  });
});
