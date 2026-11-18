import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { AutomationScheduler } from '../src/automation/automation-scheduler.service';
import { InboxService } from '../src/inbox/inbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Automations end to end: a customer message arrives through the real inbox
 * ingestion, and the matching automation answers. Real MySQL (DATABASE_URL);
 * WIPES every table: use a throwaway database.
 */
jest.setTimeout(120_000);

describe('Automations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: InboxService;
  let scheduler: AutomationScheduler;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let adminA: string;
  let adminB: string;
  let tenantAId: string;
  let tenantBId: string;
  let connectionId: string;
  let adminAId: string;
  let templateId: string;
  let seq = 0;

  async function wipe() {
    await prisma.automationRun.deleteMany();
    await prisma.automation.deleteMany();
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

  /** A customer writes in, exactly as Meta's webhook would deliver it. */
  async function customerSays(waId: string, name: string, text: string) {
    seq += 1;
    await inbox.ingestInboundMessage(tenantAId, connectionId, {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: 'mock-phone' },
      contacts: [{ wa_id: waId, profile: { name } }],
      messages: [{ from: waId, id: `wamid.test-${Date.now()}-${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    });
  }

  const conversationOf = async (waId: string) => {
    const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: tenantAId, waId } });
    return prisma.conversation.findFirstOrThrow({ where: { contactId: contact.id }, orderBy: { createdAt: 'desc' } });
  };
  const botTexts = async (waId: string) => {
    const conv = await conversationOf(waId);
    const rows = await prisma.message.findMany({ where: { conversationId: conv.id, direction: 'outbound' }, orderBy: { createdAt: 'asc' } });
    return rows.map((m) => (m.content as { body?: string }).body ?? '');
  };
  /** Automations answer asynchronously (after the event bus), so poll. */
  async function eventually<T>(check: () => Promise<T | false | null | undefined>, what: string, timeoutMs = 15_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  const quiet = (ms = 800) => new Promise((r) => setTimeout(r, ms));

  const createAutomation = (token: string, body: Record<string, unknown>) =>
    http().post(`${api}/automations`).set(auth(token)).send(body);
  const activate = (id: string, status = 'active') => http().patch(`${api}/automations/${id}/status`).set(auth(adminA)).send({ status }).expect(200);

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
    scheduler = app.get(AutomationScheduler);
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@auto.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Auto ${k}`, slug: `auto-${k}`, adminEmail: `admin@auto-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') {
        tenantAId = res.body.tenant.id;
        adminAId = res.body.admin.id;
      } else tenantBId = res.body.tenant.id;
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@auto-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@auto-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
    connectionId = (await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } })).id;
    await prisma.whatsappConnection.update({ where: { id: connectionId }, data: { phoneNumberId: 'mock-phone' } });

    templateId = (await http().post(`${api}/message-templates`).set(auth(adminA)).send({ name: 'follow_up', category: 'Marketing', language: 'en', body: 'Hi {{1}}, any questions?' }).expect(201)).body.id;
    await http().post(`${api}/message-templates/${templateId}/submit`).set(auth(adminA)).expect(200);
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  it('validates what can be saved', async () => {
    await createAutomation(adminA, { name: 'x', triggerType: 'keyword', steps: [{ type: 'send_text', text: 'hi' }] }).expect(400);
    await createAutomation(adminA, { name: 'x', triggerType: 'any_message', steps: [] }).expect(400);
    await createAutomation(adminA, { name: 'x', triggerType: 'any_message', steps: [{ type: 'send_text', text: 'a' }, { type: 'wait', minutes: 5 }] }).expect(400);
    // A template or team member that belongs to nobody in this business.
    await createAutomation(adminA, { name: 'x', triggerType: 'any_message', steps: [{ type: 'send_template', templateId: '00000000-0000-4000-8000-000000000000', bodyVars: [] }] }).expect(400);
    await createAutomation(adminA, { name: 'x', triggerType: 'any_message', steps: [{ type: 'assign', agentUserId: '00000000-0000-4000-8000-000000000000' }] }).expect(400);
  });

  it('does not answer anything until an automation is created and turned on', async () => {
    await customerSays('919811110001', 'Priya Sharma', 'hello there');
    await quiet();
    expect(await botTexts('919811110001')).toEqual([]); // the old hard-coded school reply is gone
  });

  let keywordId: string;
  it('answers a keyword with personalised text', async () => {
    const created = await createAutomation(adminA, {
      name: 'Pricing', triggerType: 'keyword', triggerConfig: { keywords: ['price', 'cost'], match: 'contains' },
      steps: [{ type: 'send_text', text: 'Hi {{first_name}}, our plans start at Rs 999.' }, { type: 'add_tag', tag: 'asked-price' }],
    }).expect(201);
    keywordId = created.body.id;
    expect(created.body.status).toBe('draft');

    await customerSays('919811110002', 'Rahul Mehta', 'What is the PRICE?');
    await quiet();
    expect(await botTexts('919811110002')).toEqual([]); // still a draft

    await activate(keywordId);
    await customerSays('919811110003', 'Asha Rao', 'What is the price?');
    await eventually(async () => (await botTexts('919811110003')).length > 0, 'keyword reply');
    expect(await botTexts('919811110003')).toEqual(['Hi Asha, our plans start at Rs 999.']);

    const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: tenantAId, waId: '919811110003' }, include: { tags: { include: { tag: true } } } });
    expect(contact.tags.map((t) => t.tag.name)).toEqual(['asked-price']);
    const detail = (await http().get(`${api}/automations`).set(auth(adminA)).expect(200)).body.find((a: { id: string }) => a.id === keywordId);
    expect(detail.runCount).toBe(1);
    const runs = (await http().get(`${api}/automations/${keywordId}/runs`).set(auth(adminA)).expect(200)).body;
    expect(runs[0]).toMatchObject({ status: 'completed', contactName: 'Asha Rao' });
  });

  it('does not repeat in the same chat within the cooldown, and ignores non-matching text', async () => {
    await customerSays('919811110003', 'Asha Rao', 'and the price for 2 users?');
    await customerSays('919811110003', 'Asha Rao', 'thanks');
    await quiet();
    expect(await botTexts('919811110003')).toHaveLength(1);
  });

  it('runs the keyword rule before the "any message" rule, and "first message" only once', async () => {
    const anyId = (await createAutomation(adminA, { name: 'Catch-all', triggerType: 'any_message', steps: [{ type: 'send_text', text: 'Thanks for writing!' }] }).expect(201)).body.id;
    await activate(anyId);
    const firstId = (await createAutomation(adminA, { name: 'Welcome', triggerType: 'first_message', steps: [{ type: 'send_text', text: 'Welcome {{name}}!' }] }).expect(201)).body.id;
    await activate(firstId);

    await customerSays('919811110004', 'Neha Joshi', 'what does it cost');
    await eventually(async () => (await botTexts('919811110004')).length > 0, 'keyword wins');
    await quiet();
    expect(await botTexts('919811110004')).toEqual(['Hi Neha, our plans start at Rs 999.']);

    await customerSays('919811110005', 'Karan Shah', 'hi');
    await eventually(async () => (await botTexts('919811110005')).length > 0, 'welcome');
    await quiet();
    expect(await botTexts('919811110005')).toEqual(['Welcome Karan Shah!']); // first_message beats any_message

    await customerSays('919811110005', 'Karan Shah', 'ok');
    await eventually(async () => (await botTexts('919811110005')).length > 1, 'catch-all');
    expect(await botTexts('919811110005')).toEqual(['Welcome Karan Shah!', 'Thanks for writing!']);

    await activate(anyId, 'paused');
    await activate(firstId, 'paused');
  });

  it('can tag, assign, set the status and hand over from the AI', async () => {
    const id = (await createAutomation(adminA, {
      name: 'Triage', triggerType: 'keyword', triggerConfig: { keywords: ['refund'] },
      steps: [{ type: 'add_tag', tag: 'refund' }, { type: 'assign', agentUserId: adminAId }, { type: 'set_status', status: 'pending' }, { type: 'handover_human' }, { type: 'send_text', text: 'A person will help you with the refund.' }],
    }).expect(201)).body.id;
    await activate(id);
    await customerSays('919811110006', 'Vikram Desai', 'I want a refund');
    await eventually(async () => (await botTexts('919811110006')).length > 0, 'triage');
    const conv = await conversationOf('919811110006');
    expect(conv).toMatchObject({ status: 'pending', assignedAgentId: adminAId, aiPaused: true });
    await activate(id, 'paused');
  });

  it('waits, then resumes through the scheduler and sends a template', async () => {
    const id = (await createAutomation(adminA, {
      name: 'Follow up', triggerType: 'keyword', triggerConfig: { keywords: ['demo'] },
      steps: [{ type: 'send_text', text: 'Booking your demo...' }, { type: 'wait', minutes: 30 }, { type: 'send_template', templateId, bodyVars: ['{{first_name}}'] }],
    }).expect(201)).body.id;
    await activate(id);
    await customerSays('919811110007', 'Meera Kulkarni', 'can I get a demo');
    const run = await eventually(async () => prisma.automationRun.findFirst({ where: { automationId: id, status: 'waiting' } }), 'run waits');
    expect(run.stepIndex).toBe(2);
    expect(run.resumeAt!.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(await botTexts('919811110007')).toEqual(['Booking your demo...']);

    await scheduler.tick(); // not due yet
    expect(await botTexts('919811110007')).toHaveLength(1);

    await prisma.automationRun.update({ where: { id: run.id }, data: { resumeAt: new Date(Date.now() - 1000) } });
    await scheduler.tick();
    expect(await botTexts('919811110007')).toEqual(['Booking your demo...', 'Hi Meera, any questions?']);
    expect((await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('completed');
    await activate(id, 'paused');
  });

  it('marks a run failed with a reason when a step cannot be done', async () => {
    const id = (await createAutomation(adminA, {
      name: 'Late text', triggerType: 'keyword', triggerConfig: { keywords: ['later'] },
      steps: [{ type: 'wait', minutes: 1 }, { type: 'send_text', text: 'Still there?' }],
    }).expect(201)).body.id;
    await activate(id);
    await customerSays('919811110008', 'Late Larry', 'call me later');
    const run = await eventually(async () => prisma.automationRun.findFirst({ where: { automationId: id, status: 'waiting' } }), 'waiting');
    // The customer's 24-hour window closes while the run waits.
    const conv = await conversationOf('919811110008');
    await prisma.conversation.update({ where: { id: conv.id }, data: { windowExpiresAt: new Date(Date.now() - 1000) } });
    await prisma.automationRun.update({ where: { id: run.id }, data: { resumeAt: new Date(Date.now() - 1000) } });
    await scheduler.tick();
    const done = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done.status).toBe('failed');
    expect(done.error).toMatch(/24-hour/);
    await activate(id, 'paused');
  });

  it('never sends automated messages to a customer who opted out', async () => {
    const id = (await createAutomation(adminA, { name: 'Everyone', triggerType: 'any_message', steps: [{ type: 'send_text', text: 'Hello!' }] }).expect(201)).body.id;
    await activate(id);
    await prisma.contact.create({ data: { tenantId: tenantAId, waId: '919811110009', displayName: 'Stopper', optedOut: true } });
    await customerSays('919811110009', 'Stopper', 'hi again');
    await quiet();
    expect(await botTexts('919811110009')).toEqual([]);
    await activate(id, 'paused');
  });

  it('keeps one business\'s automations away from another', async () => {
    expect((await http().get(`${api}/automations`).set(auth(adminB)).expect(200)).body).toEqual([]);
    await http().put(`${api}/automations/${keywordId}`).set(auth(adminB)).send({ name: 'x', triggerType: 'any_message', steps: [{ type: 'send_text', text: 'x' }] }).expect(404);
    await http().patch(`${api}/automations/${keywordId}/status`).set(auth(adminB)).send({ status: 'paused' }).expect(404);
    await http().delete(`${api}/automations/${keywordId}`).set(auth(adminB)).expect(404);
    await http().get(`${api}/automations/${keywordId}/runs`).set(auth(adminB)).expect(404);
    expect(tenantBId).toBeTruthy();
  });

  it('deletes an automation together with its run history', async () => {
    await http().delete(`${api}/automations/${keywordId}`).set(auth(adminA)).expect(204);
    expect(await prisma.automationRun.count({ where: { automationId: keywordId } })).toBe(0);
  });
});
