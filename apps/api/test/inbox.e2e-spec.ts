import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WEBHOOK_EVENTS_QUEUE } from '../src/webhook/webhook-queue.constants';

/**
 * Milestone 3: multi-agent shared live inbox — REST + tenant-isolation
 * coverage for send/assign/status. Follows the same conventions as
 * webhook.e2e-spec.ts (real Postgres + Redis, polls the BullMQ queue to
 * idle after simulate-inbound-message rather than asserting immediately).
 * Socket.IO itself is not covered here (harder to test meaningfully under
 * Jest/Supertest) — REST + tenant isolation is the focus.
 */
describe('Inbox — send/assign/status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: Queue;

  async function waitForQueueIdle(): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
      if ((counts.waiting ?? 0) === 0 && (counts.active ?? 0) === 0 && (counts.delayed ?? 0) === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for webhook-events queue to drain');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    queue = app.get<Queue>(getQueueToken(WEBHOOK_EVENTS_QUEUE));

    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await queue.obliterate({ force: true });
    await queue.close();
    await app.close();
  });

  const superAdmin = {
    email: 'super@inbox-e2e-test.local',
    password: 'password123',
    displayName: 'Inbox E2E Super Admin',
  };

  let superToken: string;
  let tenantAId: string;
  let tenantAAdminToken: string;
  let tenantAPhoneNumberId: string;
  let tenantBAdminToken: string;
  let tenantBPhoneNumberId: string;
  let agentAId: string;
  let agentAToken: string;
  let agentBToken: string;
  let conversationId: string;
  let tenantBConversationId: string;

  it('bootstraps a super_admin, two tenants, and an agent in tenant A', async () => {
    const registerRes = await request(app.getHttpServer()).post('/auth/register').send(superAdmin).expect(201);
    superToken = registerRes.body.accessToken;

    const tenantARes = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Inbox E2E Tenant A',
        slug: 'inbox-e2e-tenant-a',
        adminEmail: 'admin@inbox-e2e-a.local',
        adminPassword: 'password123',
        adminDisplayName: 'Tenant A Admin',
      })
      .expect(201);
    tenantAId = tenantARes.body.tenant.id;

    await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: 'Inbox E2E Tenant B',
        slug: 'inbox-e2e-tenant-b',
        adminEmail: 'admin@inbox-e2e-b.local',
        adminPassword: 'password123',
        adminDisplayName: 'Tenant B Admin',
      })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@inbox-e2e-a.local', password: 'password123' })
      .expect(200);
    tenantAAdminToken = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@inbox-e2e-b.local', password: 'password123' })
      .expect(200);
    tenantBAdminToken = loginB.body.accessToken;

    // Agent in tenant A, created by tenant A's admin.
    const createAgentA = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .send({ email: 'agent@inbox-e2e-a.local', password: 'password123', displayName: 'Agent A', role: 'agent' })
      .expect(201);
    agentAId = createAgentA.body.id;

    const loginAgentA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'agent@inbox-e2e-a.local', password: 'password123' })
      .expect(200);
    agentAToken = loginAgentA.body.accessToken;

    // Agent in tenant B, used for the cross-tenant isolation checks.
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .send({ email: 'agent@inbox-e2e-b.local', password: 'password123', displayName: 'Agent B', role: 'agent' })
      .expect(201);

    const loginAgentB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'agent@inbox-e2e-b.local', password: 'password123' })
      .expect(200);
    agentBToken = loginAgentB.body.accessToken;
  });

  it('mock-connects WhatsApp numbers for both tenants', async () => {
    const resA = await request(app.getHttpServer())
      .post('/whatsapp-connections/mock-connect')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(201);
    tenantAPhoneNumberId = resA.body.phoneNumberId;

    const resB = await request(app.getHttpServer())
      .post('/whatsapp-connections/mock-connect')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .expect(201);
    tenantBPhoneNumberId = resB.body.phoneNumberId;
  });

  it('creates a conversation via simulated inbound message for both tenants', async () => {
    await request(app.getHttpServer())
      .post('/dev/simulate-inbound-message')
      .send({
        phoneNumberId: tenantAPhoneNumberId,
        fromWaId: '15551110000',
        fromProfileName: 'Inbox E2E Customer A',
        text: 'Hi, is anyone there?',
      })
      .expect(202);

    await request(app.getHttpServer())
      .post('/dev/simulate-inbound-message')
      .send({
        phoneNumberId: tenantBPhoneNumberId,
        fromWaId: '15552220000',
        fromProfileName: 'Inbox E2E Customer B',
        text: 'Hello from tenant B',
      })
      .expect(202);

    await waitForQueueIdle();

    const conversationsA = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);
    expect(conversationsA.body).toHaveLength(1);
    conversationId = conversationsA.body[0].id;

    const conversationsB = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .expect(200);
    expect(conversationsB.body).toHaveLength(1);
    tenantBConversationId = conversationsB.body[0].id;
  });

  it('sends an outbound text message and it appears in GET /conversations/:id/messages', async () => {
    const sendRes = await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ messageType: 'text', text: 'Yes! How can I help?' })
      .expect(201);

    expect(sendRes.body.direction).toBe('outbound');
    expect(sendRes.body.senderType).toBe('agent');
    expect(sendRes.body.status).toBe('sent');
    expect(sendRes.body.waMessageId).toEqual(expect.any(String));
    expect(sendRes.body.content.body).toBe('Yes! How can I help?');

    const messages = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);

    expect(messages.body).toHaveLength(2);
    const outbound = messages.body.find((m: { direction: string }) => m.direction === 'outbound');
    expect(outbound).toBeDefined();
    expect(outbound.content.body).toBe('Yes! How can I help?');

    // conversation.lastMessageAt should have been bumped by the send.
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(conversation?.lastMessageAt).not.toBeNull();
  });

  it('assigns the conversation to an agent in the same tenant', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/assign`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .send({ agentUserId: agentAId })
      .expect(200);

    expect(res.body.assignedAgentId).toBe(agentAId);

    const filtered = await request(app.getHttpServer())
      .get('/conversations?assignedToMe=true')
      .set('Authorization', `Bearer ${agentAToken}`)
      .expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].id).toBe(conversationId);
  });

  it('unassigns the conversation (agentUserId: null)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/assign`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .send({ agentUserId: null })
      .expect(200);

    expect(res.body.assignedAgentId).toBeNull();
  });

  it('rejects assigning to a user from a different tenant', async () => {
    // Tenant B's agent id, submitted against tenant A's conversation via
    // tenant A's admin token — must be rejected as not-same-tenant.
    const loginAgentB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'agent@inbox-e2e-b.local', password: 'password123' })
      .expect(200);
    const agentBClaims = JSON.parse(Buffer.from(loginAgentB.body.accessToken.split('.')[1], 'base64').toString());

    await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/assign`)
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .send({ agentUserId: agentBClaims.sub })
      .expect(400);
  });

  it('updates conversation status through open -> pending -> closed', async () => {
    let res = await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/status`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ status: 'pending' })
      .expect(200);
    expect(res.body.status).toBe('pending');

    res = await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/status`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ status: 'closed' })
      .expect(200);
    expect(res.body.status).toBe('closed');

    const filtered = await request(app.getHttpServer())
      .get('/conversations?status=closed')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .expect(200);
    expect(filtered.body.map((c: { id: string }) => c.id)).toContain(conversationId);
  });

  it('returns 404 (not 403) for a Tenant B agent hitting Tenant A conversation endpoints', async () => {
    await request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .send({ messageType: 'text', text: 'should not work' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/assign`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .send({ agentUserId: null })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/status`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .send({ status: 'open' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .expect(404);
  });

  it('tenant B conversation is untouched and remains isolated from tenant A', async () => {
    const messages = await request(app.getHttpServer())
      .get(`/conversations/${tenantBConversationId}/messages`)
      .set('Authorization', `Bearer ${tenantBAdminToken}`)
      .expect(200);
    expect(messages.body).toHaveLength(1);
    expect(messages.body[0].direction).toBe('inbound');
  });
});
