import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { ClaudeClient, ClaudeError, type ClaudeResult } from '../src/ai/claude.client';
import { OpenAiClient } from '../src/ai/openai.client';
import { InboxService } from '../src/inbox/inbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * AI agents end to end, with Claude replaced by a fake (no network, no cost):
 * key handling, replies, handover to a person, failure handling and isolation.
 * Real MySQL (DATABASE_URL); WIPES every table: use a throwaway database.
 */
jest.setTimeout(120_000);

const GOOD_KEY = 'sk-ant-api03-' + 'a'.repeat(40);
const GOOD_OPENAI_KEY = 'sk-proj-' + 'o'.repeat(40);

describe('AI agents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: InboxService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let adminA: string;
  let adminB: string;
  let tenantAId: string;
  let connectionId: string;
  let agentId: string;
  let seq = 0;

  /** What the fake Claude will do next, and what it was asked. */
  let nextReply: ClaudeResult | Error = { text: 'Our shop is open 10 to 6.', toolUse: null, inputTokens: 120, outputTokens: 30 };
  const asked: { apiKey: string; model: string; system: string; messages: { role: string; content: string }[] }[] = [];
  const fakeClaude = {
    complete: async (params: { apiKey: string; model: string; system: string; messages: { role: string; content: string }[] }) => {
      asked.push(params);
      if (params.apiKey !== GOOD_KEY) throw new ClaudeError('invalid x-api-key', 401, true);
      if (nextReply instanceof Error) throw nextReply;
      return nextReply;
    },
  };

  /** The fake OpenAI: same idea, separate so we can tell which provider was asked. */
  let nextOpenAiReply: ClaudeResult = { text: 'Hello from GPT.', toolUse: null, inputTokens: 80, outputTokens: 12 };
  const askedOpenAi: { apiKey: string; model: string; system: string; messages: { role: string; content: string }[] }[] = [];
  const fakeOpenAi = {
    verifyKey: async (apiKey: string) => {
      if (apiKey !== GOOD_OPENAI_KEY) throw new ClaudeError('Incorrect API key provided', 401, true);
    },
    complete: async (params: { apiKey: string; model: string; system: string; messages: { role: string; content: string }[] }) => {
      askedOpenAi.push(params);
      return nextOpenAiReply;
    },
  };

  async function wipe() {
    await prisma.aiUsage.deleteMany();
    await prisma.aiKnowledge.deleteMany();
    await prisma.aiAgent.deleteMany();
    await prisma.aiSettings.deleteMany();
    await prisma.automationRun.deleteMany();
    await prisma.automation.deleteMany();
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

  async function customerSays(waId: string, text: string) {
    seq += 1;
    await inbox.ingestInboundMessage(tenantAId, connectionId, {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: 'mock-phone' },
      contacts: [{ wa_id: waId, profile: { name: 'Customer ' + waId.slice(-2) } }],
      messages: [{ from: waId, id: `wamid.ai-${Date.now()}-${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    });
  }
  const conversationOf = async (waId: string) => {
    const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: tenantAId, waId } });
    return prisma.conversation.findFirstOrThrow({ where: { contactId: contact.id }, orderBy: { createdAt: 'desc' } });
  };
  const outbound = async (waId: string) => {
    const conv = await conversationOf(waId);
    return prisma.message.findMany({ where: { conversationId: conv.id, direction: 'outbound' }, orderBy: { createdAt: 'asc' } });
  };
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

  beforeAll(async () => {
    process.env.WHATSAPP_MODE = 'mock';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClaudeClient)
      .useValue(fakeClaude)
      .overrideProvider(OpenAiClient)
      .useValue(fakeOpenAi)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    inbox = app.get(InboxService);
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@ai.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Shop ${k}`, slug: `ai-${k}`, adminEmail: `admin@ai-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'a') tenantAId = res.body.tenant.id;
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@ai-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@ai-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
    connectionId = (await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantAId } })).id;
    await prisma.whatsappConnection.update({ where: { id: connectionId }, data: { phoneNumberId: 'mock-phone' } });
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  const agentBody = { name: 'Asha', instructions: 'You help customers of the shop. Be polite and brief.', model: 'claude-haiku-5-5' };

  it('keeps the API key private: validated before saving, encrypted, never returned', async () => {
    await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ apiKey: 'not-a-key' }).expect(400);
    const rejected = await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ apiKey: 'sk-ant-api03-' + 'b'.repeat(40) }).expect(400);
    expect(rejected.body.message).toMatch(/rejected this API key/);
    expect((await http().get(`${api}/ai/settings`).set(auth(adminA)).expect(200)).body.hasKey).toBe(false);

    const saved = await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ apiKey: GOOD_KEY }).expect(200);
    expect(saved.body).toMatchObject({ hasKey: true, keyLast4: GOOD_KEY.slice(-4) });
    expect(JSON.stringify(saved.body)).not.toContain(GOOD_KEY);
    const row = await prisma.aiSettings.findFirstOrThrow({ where: { tenantId: tenantAId } });
    expect(row.anthropicKeyCipher).toMatch(/^v1:/);
    expect(row.anthropicKeyCipher).not.toContain(GOOD_KEY);
    expect((await http().get(`${api}/ai/settings`).set(auth(adminB)).expect(200)).body.hasKey).toBe(false);
  });

  it('creates an agent (paused), adds knowledge, and only admins may manage', async () => {
    const created = await http().post(`${api}/ai/agents`).set(auth(adminA)).send(agentBody).expect(201);
    agentId = created.body.id;
    expect(created.body).toMatchObject({ status: 'paused', model: 'claude-haiku-5-5' });
    await http().post(`${api}/ai/agents`).set(auth(adminA)).send({ ...agentBody, instructions: 'short' }).expect(400);
    await http().post(`${api}/ai/agents`).set(auth(adminA)).send({ ...agentBody, model: 'gpt-4' }).expect(400);

    const k = await http().post(`${api}/ai/agents/${agentId}/knowledge`).set(auth(adminA)).send({ title: 'Opening hours', content: 'Monday to Saturday, 10am to 6pm.' }).expect(201);
    await http().put(`${api}/ai/agents/${agentId}/knowledge/${k.body.id}`).set(auth(adminA)).send({ title: 'Opening hours', content: 'Mon-Sat 10 to 6.' }).expect(200);
    const list = (await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body;
    expect(list[0].knowledge).toHaveLength(1);
    expect(list[0].knowledge[0].content).toBe('Mon-Sat 10 to 6.');

    await http().get(`${api}/ai/agents`).set(auth(adminB)).expect(200).then((r) => expect(r.body).toEqual([]));
    await http().put(`${api}/ai/agents/${agentId}`).set(auth(adminB)).send(agentBody).expect(404);
    await http().post(`${api}/ai/agents/${agentId}/knowledge`).set(auth(adminB)).send({ title: 'x', content: 'y' }).expect(404);
  });

  it('lets you try the agent without sending anything to WhatsApp', async () => {
    nextReply = { text: 'We are open 10 to 6, Monday to Saturday.', toolUse: null, inputTokens: 200, outputTokens: 20 };
    const res = await http().post(`${api}/ai/agents/${agentId}/test`).set(auth(adminA)).send({ messages: [{ role: 'user', text: 'When are you open?' }] }).expect(200);
    expect(res.body).toMatchObject({ text: 'We are open 10 to 6, Monday to Saturday.', handedOver: false, inputTokens: 200 });
    const last = asked[asked.length - 1]!;
    expect(last.system).toContain('Mon-Sat 10 to 6.'); // knowledge is part of the prompt
    expect(last.system).toContain('Shop a'); // and the business name
    expect(last.messages).toEqual([{ role: 'user', content: 'When are you open?' }]);
    expect(await prisma.message.count()).toBe(0);
  });

  it('refuses to turn an agent on without a key and keeps one agent active at a time', async () => {
    const second = (await http().post(`${api}/ai/agents`).set(auth(adminA)).send({ ...agentBody, name: 'Second' }).expect(201)).body.id;
    await http().patch(`${api}/ai/agents/${agentId}/status`).set(auth(adminB)).send({ status: 'active' }).expect(404);
    await http().patch(`${api}/ai/agents/${agentId}/status`).set(auth(adminA)).send({ status: 'active' }).expect(200);
    await http().patch(`${api}/ai/agents/${second}/status`).set(auth(adminA)).send({ status: 'active' }).expect(200);
    const statuses = (await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body.map((a: { name: string; status: string }) => `${a.name}:${a.status}`);
    expect(statuses).toEqual(['Asha:paused', 'Second:active']);
    await http().delete(`${api}/ai/agents/${second}`).set(auth(adminA)).expect(204);
    await http().patch(`${api}/ai/agents/${agentId}/status`).set(auth(adminA)).send({ status: 'active' }).expect(200);
  });

  it('answers a customer through WhatsApp and counts usage', async () => {
    nextReply = { text: 'Hi! We are open Mon-Sat 10 to 6.', toolUse: null, inputTokens: 150, outputTokens: 25 };
    await customerSays('919822220001', 'When do you open?');
    await eventually(async () => (await outbound('919822220001')).length > 0, 'AI reply');
    const [reply] = await outbound('919822220001');
    expect(reply).toMatchObject({ senderType: 'bot', status: 'sent' });
    expect((reply!.content as { body: string }).body).toBe('Hi! We are open Mon-Sat 10 to 6.');

    const agent = (await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body[0];
    expect(agent.usage).toMatchObject({ requests: 2, inputTokens: 350, outputTokens: 45, handovers: 0, errors: 0 }); // 1 test + 1 real
  });

  it('hands over to a person when Claude asks, and then stays quiet', async () => {
    nextReply = { text: '', toolUse: 'handoff_to_human', inputTokens: 100, outputTokens: 10 };
    await customerSays('919822220002', 'I want to speak to the owner');
    await eventually(async () => (await outbound('919822220002')).length > 0, 'handover message');
    const conv = await conversationOf('919822220002');
    expect(conv).toMatchObject({ status: 'pending', aiPaused: true });
    expect(((await outbound('919822220002'))[0]!.content as { body: string }).body).toMatch(/team will take over/);

    asked.length = 0;
    await customerSays('919822220002', 'hello? anyone?');
    await quiet();
    expect(asked).toHaveLength(0); // the AI no longer answers this chat
    expect(await outbound('919822220002')).toHaveLength(1);
  });

  it('stops once a person replies, and can be switched back on for the chat', async () => {
    nextReply = { text: 'Sure, let me check.', toolUse: null, inputTokens: 90, outputTokens: 8 };
    await customerSays('919822220003', 'is this available?');
    await eventually(async () => (await outbound('919822220003')).length > 0, 'first AI reply');
    const conv = await conversationOf('919822220003');

    await http().post(`${api}/conversations/${conv.id}/messages`).set(auth(adminA)).send({ messageType: 'text', text: 'Hi, this is the owner.' }).expect(201);
    expect((await conversationOf('919822220003')).aiPaused).toBe(true);
    asked.length = 0;
    await customerSays('919822220003', 'great, thanks');
    await quiet();
    expect(asked).toHaveLength(0);

    await http().patch(`${api}/conversations/${conv.id}/ai`).set(auth(adminA)).send({ paused: false }).expect(200);
    // The conversation now has an assigned human? No: it was only replied to, so the AI may answer again.
    await customerSays('919822220003', 'one more question');
    await eventually(async () => asked.length > 0, 'AI answers again');
  });

  it('does not answer while a team member is assigned to the chat', async () => {
    nextReply = { text: 'Hello!', toolUse: null, inputTokens: 10, outputTokens: 2 };
    await customerSays('919822220004', 'hi');
    await eventually(async () => (await outbound('919822220004')).length > 0, 'AI reply');
    const conv = await conversationOf('919822220004');
    const me = (await http().get(`${api}/auth/me`).set(auth(adminA)).expect(200)).body.user.id;
    await http().patch(`${api}/conversations/${conv.id}/assign`).set(auth(adminA)).send({ agentUserId: me }).expect(200);
    asked.length = 0;
    await customerSays('919822220004', 'still there?');
    await quiet();
    expect(asked).toHaveLength(0);
  });

  it('flags the chat for a person and records the error when Claude fails', async () => {
    nextReply = new ClaudeError('Overloaded', 529);
    await customerSays('919822220005', 'hello');
    await eventually(async () => (await conversationOf('919822220005')).status === 'pending', 'flagged for a person');
    expect(await conversationOf('919822220005')).toMatchObject({ status: 'pending', aiPaused: true });
    expect(await outbound('919822220005')).toHaveLength(0); // no half-answer
    const settings = (await http().get(`${api}/ai/settings`).set(auth(adminA)).expect(200)).body;
    expect(settings.lastError).toMatch(/Overloaded/);
    const agent = (await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body[0];
    expect(agent.usage.errors).toBe(1);
  });

  it('never messages an opted-out customer', async () => {
    nextReply = { text: 'Hello!', toolUse: null, inputTokens: 10, outputTokens: 2 };
    await prisma.contact.create({ data: { tenantId: tenantAId, waId: '919822220006', displayName: 'Stopper', optedOut: true } });
    asked.length = 0;
    await customerSays('919822220006', 'hi');
    await quiet();
    expect(asked).toHaveLength(0);
  });

  it('removing the key switches every agent off', async () => {
    await http().delete(`${api}/ai/settings/key`).set(auth(adminA)).expect(200);
    expect((await http().get(`${api}/ai/settings`).set(auth(adminA)).expect(200)).body.hasKey).toBe(false);
    expect((await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body[0].status).toBe('paused');
    await http().patch(`${api}/ai/agents/${agentId}/status`).set(auth(adminA)).send({ status: 'active' }).expect(409);
  });

  describe('OpenAI as the provider', () => {
    it('refuses an invalid key, an Anthropic key sent as OpenAI, and a model of the other company', async () => {
      const bad = await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ provider: 'openai', apiKey: 'sk-proj-' + 'b'.repeat(40) }).expect(400);
      expect(bad.body.message).toMatch(/OpenAI rejected this API key/);
      await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ provider: 'openai', apiKey: GOOD_KEY }).expect(400); // an sk-ant- key is not an OpenAI key
      await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ provider: 'gemini', apiKey: GOOD_OPENAI_KEY }).expect(400);
      expect((await http().get(`${api}/ai/settings`).set(auth(adminA)).expect(200)).body.hasKey).toBe(false);
    });

    it('moves existing agents to the new provider (default model, paused) when the key is switched', async () => {
      await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ apiKey: GOOD_KEY }).expect(200); // back on Anthropic
      await http().patch(`${api}/ai/agents/${agentId}/status`).set(auth(adminA)).send({ status: 'active' }).expect(200);
      const before = (await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body[0];
      expect(before).toMatchObject({ model: 'claude-haiku-5-5', status: 'active' });

      const saved = await http().put(`${api}/ai/settings/key`).set(auth(adminA)).send({ provider: 'openai', apiKey: GOOD_OPENAI_KEY }).expect(200);
      expect(saved.body).toMatchObject({ provider: 'openai', hasKey: true, keyLast4: GOOD_OPENAI_KEY.slice(-4) });
      expect(JSON.stringify(saved.body)).not.toContain(GOOD_OPENAI_KEY);
      const after = (await http().get(`${api}/ai/agents`).set(auth(adminA)).expect(200)).body[0];
      expect(after).toMatchObject({ model: 'gpt-4o-mini', status: 'paused' });
    });

    it('only accepts models of the connected provider', async () => {
      const wrong = await http().put(`${api}/ai/agents/${agentId}`).set(auth(adminA)).send({ ...agentBody, model: 'claude-sonnet-5-5' }).expect(400);
      expect(wrong.body.message).toMatch(/choose a GPT model/);
      const ok = await http().put(`${api}/ai/agents/${agentId}`).set(auth(adminA)).send({ ...agentBody, model: 'gpt-4.1-mini' }).expect(200);
      expect(ok.body.model).toBe('gpt-4.1-mini');
      const defaulted = await http().post(`${api}/ai/agents`).set(auth(adminA)).send({ name: 'Default model', instructions: 'Help customers of the shop politely.' }).expect(201);
      expect(defaulted.body.model).toBe('gpt-4o-mini');
      await http().delete(`${api}/ai/agents/${defaulted.body.id}`).set(auth(adminA)).expect(204);
    });

    it('answers with OpenAI (and not Claude) once connected', async () => {
      await http().patch(`${api}/ai/agents/${agentId}/status`).set(auth(adminA)).send({ status: 'active' }).expect(200);
      asked.length = 0;
      askedOpenAi.length = 0;
      nextOpenAiReply = { text: 'We open at ten, Monday to Saturday.', toolUse: null, inputTokens: 90, outputTokens: 14 };
      await customerSays('919822220007', 'what time do you open?');
      await eventually(async () => (await outbound('919822220007')).length > 0, 'OpenAI reply');
      expect(((await outbound('919822220007'))[0]!.content as { body: string }).body).toBe('We open at ten, Monday to Saturday.');
      expect(asked).toHaveLength(0);
      expect(askedOpenAi).toHaveLength(1);
      expect(askedOpenAi[0]).toMatchObject({ apiKey: GOOD_OPENAI_KEY, model: 'gpt-4.1-mini' });
      expect(askedOpenAi[0]!.system).toContain('Mon-Sat 10 to 6.');
    });

    it('supports the test chat and the hand-over with OpenAI too', async () => {
      nextOpenAiReply = { text: '', toolUse: 'handoff_to_human', inputTokens: 40, outputTokens: 5 };
      const test = await http().post(`${api}/ai/agents/${agentId}/test`).set(auth(adminA)).send({ messages: [{ role: 'user', text: 'I want a person' }] }).expect(200);
      expect(test.body).toMatchObject({ handedOver: true });
      await customerSays('919822220008', 'speak to a human please');
      await eventually(async () => (await conversationOf('919822220008')).status === 'pending', 'handed over');
      expect(await conversationOf('919822220008')).toMatchObject({ status: 'pending', aiPaused: true });
    });
  });
});
