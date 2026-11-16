import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { DatabaseService } from '../src/database/database.service';
import { CampaignDispatcher } from '../src/broadcast/campaign-dispatcher.processor';
import { CampaignScheduler } from '../src/broadcast/campaign-scheduler.service';
import { WebhookProcessor } from '../src/webhook/webhook.processor';
import { BROADCAST_SEND_QUEUE } from '../src/broadcast/broadcast-queue.constants';
import { WEBHOOK_EVENTS_QUEUE } from '../src/webhook/webhook-queue.constants';

/**
 * HTTP-level wiring, routing, authorisation and validation checks that need
 * NO database or Redis: Prisma, the raw MySQL pool, the BullMQ queues and the
 * workers are all replaced with inert stubs, so this verifies the Nest
 * dependency graph and every guard/pipe in front of the services. Anything
 * that would reach the database fails loudly (the Prisma stub throws).
 */
describe('HTTP wiring: routing, auth, RBAC, validation (no infrastructure)', () => {
  let app: INestApplication;
  let sign: (role: 'super_admin' | 'tenant_admin' | 'agent') => string;

  const prismaStub = new Proxy(
    { $connect: async () => undefined, $disconnect: async () => undefined },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
        // Nest probes lifecycle hooks (onModuleInit, ...) by property name; those are not DB access.
        if (prop === 'then' || typeof prop === 'symbol' || /^(on|before)[A-Z]/.test(prop)) return undefined;
        throw new Error(`Unexpected database access: prisma.${String(prop)}`);
      },
    },
  );

  beforeAll(async () => {
    process.env.DATABASE_URL = 'mysql://stub:stub@127.0.0.1:1/stub';
    process.env.JWT_ACCESS_SECRET = 'wiring-test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'wiring-test-refresh-secret';
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'wiring-verify-token';
    process.env.WHATSAPP_MODE = 'mock';

    // Imported lazily: ConfigModule validates process.env at import time.
    const { AppModule } = await import('../src/app.module');
    const fakeQueue = { add: jest.fn(), addBulk: jest.fn(), close: jest.fn(), getJobCounts: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(getQueueToken(BROADCAST_SEND_QUEUE))
      .useValue(fakeQueue)
      .overrideProvider(getQueueToken(WEBHOOK_EVENTS_QUEUE))
      .useValue(fakeQueue)
      .overrideProvider(CampaignDispatcher)
      .useValue({})
      .overrideProvider(WebhookProcessor)
      .useValue({})
      .overrideProvider(CampaignScheduler)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const jwt = moduleRef.get(JwtService, { strict: false });
    sign = (role) =>
      jwt.sign(
        { sub: '3f2b8c9e-1d4a-4b6e-9a7c-2e5f8d1b0c33', tenantId: role === 'super_admin' ? null : '8a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e', role, email: `${role}@wiring.test` },
        { secret: 'wiring-test-access-secret', expiresIn: '5m' },
      );
  });

  afterAll(async () => {
    await app?.close();
  });

  const bearer = (role: 'super_admin' | 'tenant_admin' | 'agent') => ({ Authorization: `Bearer ${sign(role)}` });

  describe('routing', () => {
    it('serves the API under /api/v1 and not at the bare path', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts').expect(401);
      await request(app.getHttpServer()).get('/contacts').expect(404);
    });

    it('keeps Meta\'s webhook handshake at the unversioned /webhook URL', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wiring-verify-token', 'hub.challenge': 'echo-123' })
        .expect(200);
      expect(res.text).toBe('echo-123');
      await request(app.getHttpServer()).get('/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'x' }).expect(403);
    });
  });

  describe('authentication & roles', () => {
    it.each(['/api/v1/contacts', '/api/v1/campaigns', '/api/v1/message-templates', '/api/v1/whatsapp-accounts', '/api/v1/auth/me'])(
      'rejects an anonymous call to %s',
      async (path) => {
        await request(app.getHttpServer()).get(path).expect(401);
      },
    );

    it('rejects a garbage token', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });

    it('keeps platform super-admins out of tenant data', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts').set(bearer('super_admin')).expect(403);
      await request(app.getHttpServer()).get('/api/v1/campaigns').set(bearer('super_admin')).expect(403);
    });

    it('stops agents from creating or controlling campaigns, templates and accounts', async () => {
      const agent = bearer('agent');
      await request(app.getHttpServer()).post('/api/v1/campaigns').set(agent).send({}).expect(403);
      await request(app.getHttpServer()).post('/api/v1/campaigns/3f2b8c9e-1d4a-4b6e-9a7c-2e5f8d1b0c33/launch').set(agent).expect(403);
      await request(app.getHttpServer()).post('/api/v1/campaigns/3f2b8c9e-1d4a-4b6e-9a7c-2e5f8d1b0c33/pause').set(agent).expect(403);
      await request(app.getHttpServer()).post('/api/v1/campaigns/audience-preview').set(agent).send({}).expect(403);
      await request(app.getHttpServer()).post('/api/v1/message-templates').set(agent).send({}).expect(403);
      await request(app.getHttpServer()).post('/api/v1/message-templates/sync').set(agent).expect(403);
      await request(app.getHttpServer()).post('/api/v1/whatsapp-accounts/connect').set(agent).send({}).expect(403);
      await request(app.getHttpServer()).delete('/api/v1/whatsapp-accounts/me').set(agent).expect(403);
      await request(app.getHttpServer()).post('/api/v1/contacts/bulk-delete').set(agent).send({}).expect(403);
      await request(app.getHttpServer()).delete('/api/v1/contacts/3f2b8c9e-1d4a-4b6e-9a7c-2e5f8d1b0c33').set(agent).expect(403);
    });
  });

  describe('validation (400 with per-field issues)', () => {
    const admin = () => bearer('tenant_admin');

    it('rejects an invalid contact', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/contacts').set(admin()).send({ name: '', phone: '' }).expect(400);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['name', 'phone']));
    });

    it('requires the consent confirmation to import contacts', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set(admin())
        .send({ rows: [{ phone: '919876543210' }], consentConfirmed: false })
        .expect(400);
      expect(JSON.stringify(res.body.issues)).toContain('opted in');
    });

    it('rejects oversized import batches', async () => {
      const rows = Array.from({ length: 2001 }, (_, i) => ({ phone: `9198765${String(i).padStart(5, '0')}` }));
      await request(app.getHttpServer()).post('/api/v1/contacts/import').set(admin()).send({ rows, consentConfirmed: true }).expect(400);
    });

    it('rejects a template with a bad name and numbering gaps', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/message-templates')
        .set(admin())
        .send({ name: 'Bad Name', category: 'Marketing', language: 'en', body: 'Hi {{1}} and {{3}}' })
        .expect(400);
      expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['name', 'body']));
    });

    it('rejects a campaign with an empty tag audience and an insecure media URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set(admin())
        .send({ name: 'x', templateId: '3f2b8c9e-1d4a-4b6e-9a7c-2e5f8d1b0c33', audience: { mode: 'tags', tags: [] }, headerMediaUrl: 'http://insecure.test/a.png' })
        .expect(400);
      const paths = res.body.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['audience.tags', 'headerMediaUrl']));
    });

    it('rejects malformed ids and query parameters before any database access', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts/not-a-uuid').set(admin()).expect(400);
      await request(app.getHttpServer()).get('/api/v1/campaigns?status=exploded').set(admin()).expect(400);
      await request(app.getHttpServer()).get('/api/v1/contacts?pageSize=100000').set(admin()).expect(400);
    });

    it('validates WhatsApp credentials before touching Meta or the database', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/whatsapp-accounts/connect')
        .set(admin())
        .send({ wabaId: 'abc', phoneNumberId: '1', accessToken: 'short' })
        .expect(400);
      expect(res.body.issues.length).toBeGreaterThanOrEqual(3);
    });

    it('returns a clean error shape without leaking internals for unexpected failures', async () => {
      // A valid request reaches the stubbed database and fails; the client must see a generic 500.
      const res = await request(app.getHttpServer()).get('/api/v1/contacts').set(admin()).expect(500);
      expect(res.body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
      expect(JSON.stringify(res.body)).not.toContain('prisma');
    });
  });
});
