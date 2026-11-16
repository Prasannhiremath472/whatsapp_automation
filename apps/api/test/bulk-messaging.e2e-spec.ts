import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { CampaignScheduler } from '../src/broadcast/campaign-scheduler.service';

/**
 * Full bulk-messaging flow against a REAL MySQL (DATABASE_URL), using the
 * mock WhatsApp provider.
 *
 * !! This test WIPES EVERY TABLE before and after it runs (like the other
 * e2e suites). Point DATABASE_URL at a dedicated test database, never at
 * development data:
 *   DATABASE_URL=mysql://user:pass@localhost:3306/whatsapp_crm_test pnpm test:e2e
 *
 * Mock-mode conventions used here: templates auto-approve on submit, numbers
 * ending in 0000 are "not on WhatsApp", and delivered/read receipts are fed
 * through the real webhook queue after a few seconds (MOCK_AUTO_ACK).
 */
// Compiling the whole app and waiting on queues is slower than Jest's 5 s default.
jest.setTimeout(120_000);

describe('Bulk messaging — contacts → template → campaign → delivery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: CampaignScheduler;
  const http = () => request(app.getHttpServer());

  const api = '/api/v1';
  let adminA: string;
  let agentA: string;
  let adminB: string;
  let tenantAId: string;
  let templateId: string;
  let campaignId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Polls until `check` returns a truthy value (or throws on timeout). */
  async function eventually<T>(check: () => Promise<T | false | undefined>, what: string, timeoutMs = 30_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const campaignState = async (id: string, token = adminA) => (await http().get(`${api}/campaigns/${id}`).set(auth(token)).expect(200)).body;

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
    process.env.BROADCAST_RATE_PER_SECOND = '2'; // slow enough to pause mid-campaign
    process.env.WHATSAPP_MODE = 'mock';
    process.env.MOCK_AUTO_ACK = 'true';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    scheduler = app.get(CampaignScheduler);
    await wipe();
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  it('bootstraps two businesses with an admin each and an agent in business A', async () => {
    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@bulk-e2e.local', password: 'password123', displayName: 'Super' }).expect(201);
    const superToken = reg.body.accessToken;
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(superToken))
        .send({ name: `Bulk ${k}`, slug: `bulk-e2e-${k}`, adminEmail: `admin@bulk-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') tenantAId = res.body.tenant.id;
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@bulk-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@bulk-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/users`).set(auth(adminA)).send({ email: 'agent@bulk-a.local', password: 'password123', displayName: 'Agent', role: 'agent' }).expect(201);
    agentA = (await http().post(`${api}/auth/login`).send({ email: 'agent@bulk-a.local', password: 'password123' }).expect(200)).body.accessToken;

    const me = await http().get(`${api}/auth/me`).set(auth(adminA)).expect(200);
    expect(me.body.tenant).toMatchObject({ id: tenantAId, name: 'Bulk a', timezone: 'Asia/Kolkata' });
  });

  it('reports no WhatsApp account until one is connected', async () => {
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminB)).expect(201); // B is connected, A is not yet
    const accounts = await http().get(`${api}/whatsapp-accounts`).set(auth(adminA)).expect(200);
    expect(accounts.body).toEqual([]);
  });

  it('connects a (mock) WhatsApp account without ever returning the token', async () => {
    const res = await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
    expect(res.body).toMatchObject({ status: 'connected', isMock: true });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('creates a template, submits it, and (mock) approves it', async () => {
    const created = await http()
      .post(`${api}/message-templates`)
      .set(auth(adminA))
      .send({ name: 'welcome_offer', category: 'Marketing', language: 'en', body: 'Hi {{1}}, our offer is live!' })
      .expect(201);
    templateId = created.body.id;
    expect(created.body).toMatchObject({ status: 'draft', bodyVariableCount: 1 });

    await http().post(`${api}/message-templates`).set(auth(adminA)).send({ name: 'welcome_offer', category: 'Marketing', language: 'en', body: 'dup' }).expect(409);

    const submitted = await http().post(`${api}/message-templates/${templateId}/submit`).set(auth(adminA)).expect(200);
    expect(submitted.body.status).toBe('approved');
    // Approved templates are immutable.
    await http().put(`${api}/message-templates/${templateId}`).set(auth(adminA)).send({ name: 'welcome_offer', category: 'Marketing', language: 'en', body: 'changed' }).expect(409);
  });

  it('imports contacts: normalises numbers, de-duplicates, reports invalid rows and applies tags', async () => {
    const res = await http()
      .post(`${api}/contacts/import`)
      .set(auth(adminA))
      .send({
        consentConfirmed: true,
        defaultCountryCode: '91',
        tags: ['Diwali'],
        rows: [
          { name: 'Asha Rao', phone: '98765 00001' }, // national format -> 919876500001
          { name: 'Bela Shah', phone: '+91 98765 00002', email: 'bela@example.com', location: 'Pune' },
          { name: 'Chitra', phone: '919876500003' },
          { name: 'Not On WhatsApp', phone: '+91 98765 00000' }, // mock: permanent failure
          { name: 'Bad', phone: '123' }, // invalid
          { name: 'Asha again', phone: '9876500001' }, // duplicate within the file
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({ created: 4, updated: 0, skipped: 1 });
    expect(res.body.invalid).toEqual([expect.objectContaining({ row: 5, reason: expect.any(String) })]);

    const tagged = await http().get(`${api}/contacts`).query({ tag: 'Diwali' }).set(auth(adminA)).expect(200);
    expect(tagged.body.meta.total).toBe(4);
    expect(tagged.body.data.map((c: any) => c.phone).sort()).toEqual(['919876500000', '919876500001', '919876500002', '919876500003']);

    const tags = await http().get(`${api}/contacts/tags`).set(auth(adminA)).expect(200);
    expect(tags.body).toEqual([{ name: 'Diwali', contacts: 4 }]);

    // Re-importing updates rather than duplicates.
    const again = await http()
      .post(`${api}/contacts/import`)
      .set(auth(adminA))
      .send({ consentConfirmed: true, defaultCountryCode: '91', rows: [{ name: 'Asha R.', phone: '9876500001' }] })
      .expect(200);
    expect(again.body).toMatchObject({ created: 0, updated: 1 });
  });

  it('keeps each business\'s contacts, templates and campaigns private', async () => {
    const other = await http().get(`${api}/contacts`).set(auth(adminB)).expect(200);
    expect(other.body.meta.total).toBe(0);
    await http().get(`${api}/message-templates/${templateId}`).set(auth(adminB)).expect(404);
    // A campaign in B cannot target A's template, even by guessing its id.
    await http()
      .post(`${api}/campaigns`)
      .set(auth(adminB))
      .send({ name: 'sneaky', templateId, audience: { mode: 'all' }, variableMapping: { header: [], body: [{ source: 'static', value: 'x' }] } })
      .expect(400);
  });

  it('previews the audience and requires approved templates / mapped variables to launch', async () => {
    const preview = await http().post(`${api}/campaigns/audience-preview`).set(auth(adminA)).send({ audience: { mode: 'tags', tags: ['Diwali'] } }).expect(200);
    expect(preview.body).toMatchObject({ total: 4, eligible: 4, optedOut: 0 });

    // Missing mapping for {{1}} -> cannot launch.
    const draft = await http()
      .post(`${api}/campaigns`)
      .set(auth(adminA))
      .send({ name: 'Diwali blast', templateId, audience: { mode: 'tags', tags: ['Diwali'] } })
      .expect(201);
    await http().post(`${api}/campaigns/${draft.body.id}/launch`).set(auth(adminA)).expect(400);
    await http().delete(`${api}/campaigns/${draft.body.id}`).set(auth(adminA)).expect(204);
  });

  it('sends a campaign to every eligible contact, tracking failures, delivery and reads', async () => {
    const created = await http()
      .post(`${api}/campaigns`)
      .set(auth(adminA))
      .send({
        name: 'Diwali blast',
        objective: 'Promotion',
        templateId,
        audience: { mode: 'tags', tags: ['Diwali'] },
        variableMapping: { header: [], body: [{ source: 'field', field: 'firstName', fallback: 'there' }] },
      })
      .expect(201);
    campaignId = created.body.id;
    expect(created.body.status).toBe('draft');

    // Agents can watch but not launch.
    await http().post(`${api}/campaigns/${campaignId}/launch`).set(auth(agentA)).expect(403);
    await http().get(`${api}/campaigns/${campaignId}`).set(auth(agentA)).expect(200);

    const launched = await http().post(`${api}/campaigns/${campaignId}/launch`).set(auth(adminA)).expect(200);
    expect(launched.body.status).toBe('running');
    await http().post(`${api}/campaigns/${campaignId}/launch`).set(auth(adminA)).expect(409); // not launchable twice

    const done = await eventually(async () => {
      const c = await campaignState(campaignId);
      return c.status === 'completed' ? c : false;
    }, 'campaign to complete');
    expect(done.counts).toMatchObject({ total: 4, sent: 3, failed: 1, skipped: 0 });

    // Delivered receipts arrive through the real webhook pipeline.
    const withReceipts = await eventually(async () => {
      const c = await campaignState(campaignId);
      return c.counts.delivered >= 3 ? c : false;
    }, 'delivery receipts', 20_000);
    expect(withReceipts.counts.delivered).toBe(3);
    expect(withReceipts.counts.read).toBeLessThanOrEqual(3);

    const failed = await http().get(`${api}/campaigns/${campaignId}/recipients`).query({ status: 'failed' }).set(auth(adminA)).expect(200);
    expect(failed.body.data).toEqual([expect.objectContaining({ phone: '919876500000', errorCode: '131026' })]);

    // Each send is also in the contact's conversation thread.
    expect(await prisma.message.count({ where: { tenantId: tenantAId, messageType: 'template' } })).toBe(3);

    // Used templates cannot be deleted.
    await http().delete(`${api}/message-templates/${templateId}`).set(auth(adminA)).expect(409);
  });

  it('retries failed recipients on request', async () => {
    const res = await http().post(`${api}/campaigns/${campaignId}/retry-failed`).set(auth(adminA)).expect(200);
    expect(res.body.status).toBe('running');
    const done = await eventually(async () => {
      const c = await campaignState(campaignId);
      return c.status === 'completed' ? c : false;
    }, 'retry to finish');
    expect(done.counts).toMatchObject({ sent: 3, failed: 1 }); // the mock still rejects that number
  });

  it('honours a STOP reply: opted-out contacts are excluded from later campaigns', async () => {
    const conn = await prisma.whatsappConnection.findUniqueOrThrow({ where: { tenantId: tenantAId } });
    await http().post('/dev/simulate-inbound-message').send({ phoneNumberId: conn.phoneNumberId, fromWaId: '919876500001', text: 'STOP' }).expect(202);

    await eventually(async () => {
      const r = await http().get(`${api}/contacts`).query({ optedOut: 'true' }).set(auth(adminA)).expect(200);
      return r.body.meta.total === 1 ? r : false;
    }, 'contact to be marked opted out');

    const preview = await http().post(`${api}/campaigns/audience-preview`).set(auth(adminA)).send({ audience: { mode: 'all' } }).expect(200);
    expect(preview.body).toMatchObject({ total: 4, eligible: 3, optedOut: 1 });

    const c = (
      await http()
        .post(`${api}/campaigns`)
        .set(auth(adminA))
        .send({ name: 'Second', templateId, audience: { mode: 'all' }, variableMapping: { header: [], body: [{ source: 'static', value: 'friend' }] } })
        .expect(201)
    ).body;
    await http().post(`${api}/campaigns/${c.id}/launch`).set(auth(adminA)).expect(200);
    const done = await eventually(async () => {
      const s = await campaignState(c.id);
      return s.status === 'completed' || s.status === 'failed' ? s : false;
    }, 'second campaign to finish');
    expect(done.counts).toMatchObject({ total: 4, sent: 2, failed: 1, skipped: 1 });
  });

  it('pauses mid-run, resumes without re-sending, and can be cancelled', async () => {
    // 6 fresh contacts at 2 msg/s => ~3 s of sending, plenty of time to pause.
    await http()
      .post(`${api}/contacts/import`)
      .set(auth(adminA))
      .send({ consentConfirmed: true, tags: ['Slow'], rows: Array.from({ length: 6 }, (_, i) => ({ name: `Slow ${i}`, phone: `9198711000${String(i + 10)}` })) })
      .expect(200);
    const c = (
      await http()
        .post(`${api}/campaigns`)
        .set(auth(adminA))
        .send({ name: 'Slow one', templateId, audience: { mode: 'tags', tags: ['Slow'] }, variableMapping: { header: [], body: [{ source: 'static', value: 'there' }] } })
        .expect(201)
    ).body;
    await http().post(`${api}/campaigns/${c.id}/launch`).set(auth(adminA)).expect(200);

    await http().post(`${api}/campaigns/${c.id}/pause`).set(auth(adminA)).expect(200);
    const paused = await eventually(async () => {
      const s = await campaignState(c.id);
      return s.status === 'paused' ? s : false;
    }, 'pause');
    // Give any in-flight batch time to land, then confirm nothing more is sent while paused.
    await new Promise((r) => setTimeout(r, 2500));
    const afterPause = await campaignState(c.id);
    expect(afterPause.counts.sent).toBeLessThan(6);
    const sentWhilePaused = afterPause.counts.sent;
    await new Promise((r) => setTimeout(r, 1500));
    expect((await campaignState(c.id)).counts.sent).toBe(sentWhilePaused);
    expect(paused.statusReason).toBe('Paused by user');

    await http().post(`${api}/campaigns/${c.id}/resume`).set(auth(adminA)).expect(200);
    const done = await eventually(async () => {
      const s = await campaignState(c.id);
      return s.status === 'completed' ? s : false;
    }, 'resumed campaign to finish', 40_000);
    expect(done.counts).toMatchObject({ total: 6, sent: 6, failed: 0 });
    // Nobody was messaged twice.
    const waIds = (await prisma.broadcastRecipient.findMany({ where: { campaignId: c.id } })).map((r) => r.waMessageId);
    expect(new Set(waIds).size).toBe(6);
  });

  it('schedules a campaign for later, starts it when due, and cancels another', async () => {
    const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
    const draft = (
      await http()
        .post(`${api}/campaigns`)
        .set(auth(adminA))
        .send({
          name: 'Tomorrow',
          templateId,
          audience: { mode: 'tags', tags: ['Slow'] },
          variableMapping: { header: [], body: [{ source: 'static', value: 'x' }] },
          schedule: { date: tomorrow, time: '09:30' },
        })
        .expect(201)
    ).body;
    expect(draft.scheduledAt).toMatch(/T04:00:00\.000Z$/); // 09:30 IST == 04:00 UTC

    const scheduled = await http().post(`${api}/campaigns/${draft.id}/launch`).set(auth(adminA)).expect(200);
    expect(scheduled.body.status).toBe('scheduled');

    // Pretend the time has arrived: the scheduler picks it up and sends.
    await prisma.broadcastCampaign.update({ where: { id: draft.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
    await scheduler.tick();
    await eventually(async () => ((await campaignState(draft.id)).status === 'completed' ? true : false), 'scheduled campaign to run', 40_000);

    const other = (
      await http()
        .post(`${api}/campaigns`)
        .set(auth(adminA))
        .send({
          name: 'To cancel',
          templateId,
          audience: { mode: 'all' },
          variableMapping: { header: [], body: [{ source: 'static', value: 'x' }] },
          schedule: { date: tomorrow, time: '10:00' },
        })
        .expect(201)
    ).body;
    await http().post(`${api}/campaigns/${other.id}/launch`).set(auth(adminA)).expect(200);
    const cancelled = await http().post(`${api}/campaigns/${other.id}/cancel`).set(auth(adminA)).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('lists campaigns with summary counts and paging, and isolates them per business', async () => {
    const list = await http().get(`${api}/campaigns`).query({ pageSize: 2, page: 1 }).set(auth(adminA)).expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(list.body.data).toHaveLength(2);

    const summary = await http().get(`${api}/campaigns/summary`).set(auth(adminA)).expect(200);
    expect(summary.body.total).toBeGreaterThanOrEqual(4);
    expect(summary.body.cancelled).toBe(1);

    expect((await http().get(`${api}/campaigns`).set(auth(adminB)).expect(200)).body.meta.total).toBe(0);
    await http().get(`${api}/campaigns/${campaignId}`).set(auth(adminB)).expect(404);
    await http().post(`${api}/campaigns/${campaignId}/pause`).set(auth(adminB)).expect(404);
  });
});
