import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Runs against a real MySQL instance (DATABASE_URL from apps/api/.env —
 * provided by infra/docker-compose.yml). Wipes webhook/M2 + M1 tables before
 * running for a deterministic starting state.
 *
 * Ingestion happens asynchronously via the webhook worker (events are stored
 * in the database first), so tests wait until no event is left to process
 * after triggering a simulate-* call rather than asserting immediately.
 */
describe('Webhook + Router + Inbox (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const superAdmin = {
    email: 'super@webhook-e2e-test.local',
    password: 'password123',
    displayName: 'Webhook E2E Super Admin',
  };

  async function waitForQueueIdle(): Promise<void> {
    // Processed events are deleted, so "idle" means no pending/processing
    // event is left. Short interval + generous timeout since this is all localhost.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const open = await prisma.webhookEvent.count({ where: { status: { in: ['pending', 'processing'] } } });
      if (open === 0) {
        // Give the worker a brief moment to settle after the last event.
        await new Promise((resolve) => setTimeout(resolve, 300));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for webhook events to be processed');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Clean slate: order matters due to FKs.
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.webhookEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await app.close();
  });

  let superToken: string;
  let tenantAId: string;
  let tenantAAdminToken: string;
  let tenantAPhoneNumberId: string;
  let tenantBAdminToken: string;

  it('bootstraps a super_admin and two tenants', async () => {
    const registerRes = await request(app.getHttpServer()).post('/auth/register').send(superAdmin).expect(201);
    superToken = registerRes.body.accessToken;

    const tenantARes = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Webhook E2E Tenant A',
        slug: 'webhook-e2e-tenant-a',
        adminEmail: 'admin@webhook-e2e-a.local',
        adminPassword: 'password123',
        adminDisplayName: 'Tenant A Admin',
      })
      .expect(201);
    tenantAId = tenantARes.body.tenant.id;

    await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Webhook E2E Tenant B',
        slug: 'webhook-e2e-tenant-b',
        adminEmail: 'admin@webhook-e2e-b.local',
        adminPassword: 'password123',
        adminDisplayName: 'Tenant B Admin',
      })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@webhook-e2e-a.local', password: 'password123' })
      .expect(200);
    tenantAAdminToken = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@webhook-e2e-b.local', password: 'password123' })
      .expect(200);
    tenantBAdminToken = loginB.body.accessToken;
  });

  it('mock-connects a WhatsApp number for tenant A', async () => {
    const res = await request(app.getHttpServer())
      .post('/whatsapp-connections/mock-connect')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(201);

    expect(res.body.tenantId).toBe(tenantAId);
    expect(res.body.isMock).toBe(true);
    expect(res.body.connectionStatus).toBe('connected');
    tenantAPhoneNumberId = res.body.phoneNumberId;
    expect(tenantAPhoneNumberId).toEqual(expect.any(String));
  });

  it('performs the GET /webhook verification handshake', async () => {
    const okRes = await request(app.getHttpServer())
      .get('/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'dev-webhook-verify-token', 'hub.challenge': 'challenge-123' })
      .expect(200);
    expect(okRes.text).toBe('challenge-123');

    await request(app.getHttpServer())
      .get('/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'challenge-123' })
      .expect(403);
  });

  let conversationId: string;

  it('simulates an inbound text message and ingests it correctly scoped to tenant A', async () => {
    await request(app.getHttpServer())
      .post('/dev/simulate-inbound-message')
      .send({
        phoneNumberId: tenantAPhoneNumberId,
        fromWaId: '15559998888',
        fromProfileName: 'E2E Customer',
        text: 'Hello, I need help with my order',
      })
      .expect(202);

    await waitForQueueIdle();

    const contact = await prisma.contact.findUnique({
      where: { tenantId_waId: { tenantId: tenantAId, waId: '15559998888' } },
    });
    expect(contact).not.toBeNull();
    expect(contact?.profileName).toBe('E2E Customer');

    const conversations = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    expect(conversations.body).toHaveLength(1);
    expect(conversations.body[0].tenantId).toBe(tenantAId);
    conversationId = conversations.body[0].id;

    const messages = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    expect(messages.body).toHaveLength(1);
    expect(messages.body[0].direction).toBe('inbound');
    expect(messages.body[0].messageType).toBe('text');
    expect(messages.body[0].content.body).toBe('Hello, I need help with my order');
    expect(messages.body[0].status).toBe('delivered');
  });

  it('does NOT leak tenant A conversations to tenant B (tenant isolation)', async () => {
    const tenantBConversations = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .expect(200);

    expect(tenantBConversations.body).toHaveLength(0);
  });

  it('threads a second inbound message from the same contact into the same conversation', async () => {
    await request(app.getHttpServer())
      .post('/dev/simulate-inbound-message')
      .send({
        phoneNumberId: tenantAPhoneNumberId,
        fromWaId: '15559998888',
        fromProfileName: 'E2E Customer',
        text: 'Any update?',
      })
      .expect(202);

    await waitForQueueIdle();

    const conversations = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    expect(conversations.body).toHaveLength(1);
    expect(conversations.body[0].id).toBe(conversationId);

    const messages = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    expect(messages.body).toHaveLength(2);
    expect(messages.body.every((m: { conversationId: string }) => m.conversationId === conversationId)).toBe(true);
  });

  it('simulates a status-update event and updates the matching message status', async () => {
    const messagesBefore = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    const targetMessage = messagesBefore.body.find((m: { content: { body: string } }) =>
      m.content.body === 'Hello, I need help with my order',
    );
    expect(targetMessage).toBeDefined();
    expect(targetMessage.status).toBe('delivered');

    await request(app.getHttpServer())
      .post('/dev/simulate-status-update')
      .send({
        phoneNumberId: tenantAPhoneNumberId,
        waMessageId: targetMessage.waMessageId,
        status: 'read',
      })
      .expect(202);

    await waitForQueueIdle();

    const messagesAfter = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    const updatedMessage = messagesAfter.body.find((m: { id: string }) => m.id === targetMessage.id);
    expect(updatedMessage.status).toBe('read');
  });
});
