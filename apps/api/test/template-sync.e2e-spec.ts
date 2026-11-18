import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { WHATSAPP_PROVIDER, type RemoteTemplate } from '../src/whatsapp-connections/whatsapp-provider.interface';

/**
 * "Sync from Meta" must flag templates that are not on the connected WhatsApp
 * account (the cause of Meta error 132001 "template does not exist"). Meta is
 * replaced by a fake list. Real MySQL (DATABASE_URL); WIPES every table: use a
 * throwaway database.
 */
jest.setTimeout(120_000);

describe('Template sync flags templates missing from Meta (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let admin: string;
  let tenantId: string;

  /** What "Meta" currently lists for the connected account. */
  let metaTemplates: RemoteTemplate[] = [];
  const remote = (name: string, language = 'en', status: RemoteTemplate['status'] = 'approved'): RemoteTemplate => ({
    id: `meta-${name}`, name, language, category: 'MARKETING', status, headerType: 'none', body: `Body of ${name}`, buttons: [],
  });

  async function wipe() {
    await prisma.broadcastRecipient.deleteMany();
    await prisma.broadcastCampaign.deleteMany();
    await prisma.messageTemplate.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  }
  const template = (name: string, status: 'approved' | 'pending' | 'draft' | 'rejected', extra: Record<string, unknown> = {}) =>
    prisma.messageTemplate.create({ data: { tenantId, name, category: 'Marketing', language: 'en', body: `Body of ${name}`, status, ...extra } });
  const statusOf = async (name: string) => (await prisma.messageTemplate.findFirstOrThrow({ where: { tenantId, name } }));
  const sync = () => http().post(`${api}/message-templates/sync`).set(auth(admin)).expect(200);

  beforeAll(async () => {
    process.env.WHATSAPP_MODE = 'mock';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WHATSAPP_PROVIDER)
      .useValue({ fetchTemplates: async () => metaTemplates })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@sync.local', password: 'password123', displayName: 'Super' }).expect(201);
    const t = await http().post(`${api}/tenants`).set(auth(reg.body.accessToken)).send({ name: 'Sync', slug: 'sync-e2e', adminEmail: 'admin@sync.local', adminPassword: 'password123', adminDisplayName: 'Admin' }).expect(201);
    tenantId = t.body.tenant.id;
    admin = (await http().post(`${api}/auth/login`).send({ email: 'admin@sync.local', password: 'password123' }).expect(200)).body.accessToken;
    // A real (non-mock) connection, as in production.
    await prisma.whatsappConnection.create({
      data: { tenantId, phoneNumberId: 'pn-1', wabaId: 'waba-1', connectionStatus: 'connected', isMock: false, accessTokenEncrypted: 'x', webhookVerifyToken: 'v' },
    });
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  it('flags approved and pending templates that Meta does not have, and keeps the rest', async () => {
    await template('welcome', 'approved'); // left over from Meta's test account: not on the real one
    await template('old_pending', 'pending');
    await template('on_meta', 'approved');
    await template('my_draft', 'draft'); // never submitted: not Meta's to know about
    await template('already_rejected', 'rejected', { rejectionReason: 'Meta said no' });
    metaTemplates = [remote('on_meta'), remote('only_on_meta')];

    const res = await sync();
    expect(res.body).toEqual({ created: 1, updated: 1, flagged: 2 });

    const welcome = await statusOf('welcome');
    expect(welcome.status).toBe('rejected');
    expect(welcome.rejectionReason).toMatch(/Not found on your connected WhatsApp Business Account/);
    expect((await statusOf('old_pending')).status).toBe('rejected');
    expect((await statusOf('on_meta')).status).toBe('approved');
    expect((await statusOf('only_on_meta')).status).toBe('approved'); // pulled in from Meta
    expect((await statusOf('my_draft')).status).toBe('draft');
    expect((await statusOf('already_rejected')).rejectionReason).toBe('Meta said no'); // untouched
  });

  it('keeps a template that was submitted a moment ago and is not listed yet', async () => {
    await template('just_submitted', 'pending', { submittedAt: new Date(Date.now() - 60_000) });
    const res = await sync();
    expect(res.body.flagged).toBe(0);
    expect((await statusOf('just_submitted')).status).toBe('pending');
  });

  it('brings a flagged template back when it appears on Meta', async () => {
    metaTemplates = [remote('on_meta'), remote('only_on_meta'), remote('welcome')];
    await sync();
    const welcome = await statusOf('welcome');
    expect(welcome.status).toBe('approved');
    expect(welcome.rejectionReason).toBeNull();
  });

  it('flagged templates can no longer be used in a campaign', async () => {
    metaTemplates = [remote('on_meta'), remote('only_on_meta')];
    await sync();
    const approved = (await http().get(`${api}/message-templates`).query({ status: 'approved' }).set(auth(admin)).expect(200)).body.map((x: { name: string }) => x.name).sort();
    expect(approved).toEqual(['on_meta', 'only_on_meta']);
  });

  it('never flags anything in test (mock) mode, where Meta has no templates to compare with', async () => {
    await prisma.whatsappConnection.updateMany({ where: { tenantId }, data: { isMock: true } });
    metaTemplates = [];
    const res = await sync();
    expect(res.body.flagged).toBe(0);
    expect((await statusOf('on_meta')).status).toBe('approved');
  });
});
