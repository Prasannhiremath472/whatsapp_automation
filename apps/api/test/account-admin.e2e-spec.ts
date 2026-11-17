import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Profile, password change, business settings and team management endpoints.
 * Real MySQL (DATABASE_URL); WIPES every table: use a throwaway database.
 */
jest.setTimeout(120_000);

describe('Account & team administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string, password: string) =>
    http().post(`${api}/auth/login`).send({ email, password });

  let adminA: string;
  let adminAId: string;
  let adminB: string;
  let agentId: string;
  let agentToken: string;
  let adminBUserId: string;

  async function wipe() {
    await prisma.mediaAsset.deleteMany();
    await prisma.messageTemplate.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
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
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@acct.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      const res = await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Acct ${k}`, slug: `acct-${k}`, adminEmail: `admin@acct-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
      if (k === 'b') adminBUserId = res.body.admin.id;
    }
    const a = await login('admin@acct-a.local', 'password123').then((r) => r.body);
    adminA = a.accessToken;
    adminAId = a.user.id;
    adminB = (await login('admin@acct-b.local', 'password123')).body.accessToken;
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  it('lets a user change their display name', async () => {
    const res = await http().patch(`${api}/users/me`).set(auth(adminA)).send({ displayName: '  Priya Owner ' }).expect(200);
    expect(res.body.displayName).toBe('Priya Owner');
    expect((await http().get(`${api}/auth/me`).set(auth(adminA)).expect(200)).body.user.displayName).toBe('Priya Owner');
    await http().patch(`${api}/users/me`).set(auth(adminA)).send({ displayName: '' }).expect(400);
  });

  it('edits the business name, category and time zone (admin only, validated)', async () => {
    const res = await http().patch(`${api}/tenants/me`).set(auth(adminA)).send({ name: 'Acme Retail', business_category: 'Retail', timezone: 'Asia/Dubai' }).expect(200);
    expect(res.body).toMatchObject({ name: 'Acme Retail', business_category: 'Retail' });
    const me = (await http().get(`${api}/auth/me`).set(auth(adminA)).expect(200)).body.tenant;
    expect(me).toMatchObject({ name: 'Acme Retail', businessCategory: 'Retail', timezone: 'Asia/Dubai' });
    await http().patch(`${api}/tenants/me`).set(auth(adminA)).send({ timezone: 'Mars/Olympus' }).expect(400);
    // The other business is untouched.
    expect((await http().get(`${api}/tenants/me`).set(auth(adminB)).expect(200)).body.name).toBe('Acct b');
  });

  it('adds an agent who can sign in but cannot manage the business', async () => {
    const created = await http().post(`${api}/users`).set(auth(adminA)).send({ email: 'agent@acct-a.local', password: 'agentpass1', displayName: 'Agent', role: 'agent' }).expect(201);
    agentId = created.body.id;
    agentToken = (await login('agent@acct-a.local', 'agentpass1').then((r) => r.body)).accessToken;
    await http().patch(`${api}/tenants/me`).set(auth(agentToken)).send({ name: 'Hacked' }).expect(403);
    await http().post(`${api}/users`).set(auth(agentToken)).send({ email: 'x@acct-a.local', password: 'password123', displayName: 'X' }).expect(403);
    await http().post(`${api}/users/${adminAId}/reset-password`).set(auth(agentToken)).send({ newPassword: 'hackedpass1' }).expect(403);
  });

  it('changes your own password: wrong current password is refused, sessions end, new password works', async () => {
    const fresh = await login('agent@acct-a.local', 'agentpass1').then((r) => r.body);
    await http().post(`${api}/users/me/password`).set(auth(agentToken)).send({ currentPassword: 'nope-nope', newPassword: 'brandnewpass1' }).expect(401);
    await http().post(`${api}/users/me/password`).set(auth(agentToken)).send({ currentPassword: 'agentpass1', newPassword: 'short' }).expect(400);
    await http().post(`${api}/users/me/password`).set(auth(agentToken)).send({ currentPassword: 'agentpass1', newPassword: 'agentpass1' }).expect(400);
    await http().post(`${api}/users/me/password`).set(auth(agentToken)).send({ currentPassword: 'agentpass1', newPassword: 'brandnewpass1' }).expect(204);

    await http().post(`${api}/auth/refresh`).send({ refreshToken: fresh.refreshToken }).expect(401); // old sessions revoked
    await login('agent@acct-a.local', 'agentpass1').then((r) => expect(r.status).toBe(401));
    await login('agent@acct-a.local', 'brandnewpass1').then((r) => expect(r.status).toBe(200));
  });

  it('lets an admin reset a teammate password, only inside their own business', async () => {
    await http().post(`${api}/users/${agentId}/reset-password`).set(auth(adminA)).send({ newPassword: 'resetbyadmin1' }).expect(204);
    await login('agent@acct-a.local', 'resetbyadmin1').then((r) => expect(r.status).toBe(200));
    await http().post(`${api}/users/${agentId}/reset-password`).set(auth(adminB)).send({ newPassword: 'resetbyadmin1' }).expect(404);
    await http().post(`${api}/users/${adminBUserId}/reset-password`).set(auth(adminA)).send({ newPassword: 'resetbyadmin1' }).expect(404);
  });

  it('promotes and demotes teammates, but never leaves the business without an admin', async () => {
    const promoted = await http().patch(`${api}/users/${agentId}`).set(auth(adminA)).send({ role: 'tenant_admin' }).expect(200);
    expect(promoted.body.role).toBe('tenant_admin');
    // You cannot demote or deactivate yourself.
    await http().patch(`${api}/users/${adminAId}`).set(auth(adminA)).send({ isActive: false }).expect(409);
    await http().patch(`${api}/users/${adminAId}`).set(auth(adminA)).send({ role: 'agent' }).expect(409);
    // Demoting the other admin is fine because you remain.
    await http().patch(`${api}/users/${agentId}`).set(auth(adminA)).send({ role: 'agent' }).expect(200);
    // Admin B is the only admin of business B.
    await http().patch(`${api}/users/${adminBUserId}`).set(auth(adminB)).send({ isActive: false }).expect(409);
    await http().patch(`${api}/users/${adminBUserId}`).set(auth(adminA)).send({ role: 'agent' }).expect(403);
  });

  it('deactivating a user signs them out and blocks login; reactivating restores it', async () => {
    const session = await login('agent@acct-a.local', 'resetbyadmin1').then((r) => r.body);
    await http().patch(`${api}/users/${agentId}`).set(auth(adminA)).send({ isActive: false }).expect(200);
    await http().post(`${api}/auth/refresh`).send({ refreshToken: session.refreshToken }).expect(401);
    await login('agent@acct-a.local', 'resetbyadmin1').then((r) => expect(r.status).toBe(401));
    await http().patch(`${api}/users/${agentId}`).set(auth(adminA)).send({ isActive: true }).expect(200);
    await login('agent@acct-a.local', 'resetbyadmin1').then((r) => expect(r.status).toBe(200));
  });
});
