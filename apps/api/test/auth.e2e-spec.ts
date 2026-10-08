import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Runs against a real Postgres instance (DATABASE_URL from the environment,
 * see apps/api/.env). Wipes the users/tenants/refresh_tokens tables before
 * running so the "bootstrap only when zero users exist" flow is exercised
 * deterministically.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const superAdmin = {
    email: 'super@e2e-test.local',
    password: 'password123',
    displayName: 'E2E Super Admin',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    // Clean slate: order matters due to FKs. M2 tables (message/conversation/
    // contact/whatsappConnection) also FK onto tenant, so they must be
    // cleared first even though this spec doesn't exercise them directly.
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.whatsappConnection.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await app.close();
  });

  let accessToken: string;

  it('bootstraps the first super_admin with no auth required', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send(superAdmin).expect(201);

    expect(res.body.user.role).toBe('super_admin');
    expect(res.body.user.tenantId).toBeNull();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('rejects a second bootstrap attempt once a user exists', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'someone-else@e2e-test.local', password: 'password123', displayName: 'Nope' })
      .expect(403);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdmin.email, password: superAdmin.password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    accessToken = res.body.accessToken;
  });

  it('rejects login with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdmin.email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects a protected route with no token', async () => {
    await request(app.getHttpServer()).get('/tenants').expect(401);
  });

  it('allows a super_admin to access a protected super_admin-only route', async () => {
    await request(app.getHttpServer())
      .get('/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rejects a role-mismatched caller from a super_admin-only route', async () => {
    // Create a tenant + tenant_admin via the super_admin, then try to hit
    // a super_admin-only route as that tenant_admin.
    const createRes = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'E2E Tenant',
        slug: 'e2e-tenant',
        adminEmail: 'admin@e2e-tenant.local',
        adminPassword: 'password123',
        adminDisplayName: 'E2E Tenant Admin',
      })
      .expect(201);

    expect(createRes.body.tenant.slug).toBe('e2e-tenant');

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@e2e-tenant.local', password: 'password123' })
      .expect(200);

    const tenantAdminToken = loginRes.body.accessToken;

    await request(app.getHttpServer())
      .get('/tenants')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .expect(403);

    // But the tenant_admin CAN access their own tenant via /tenants/me.
    await request(app.getHttpServer())
      .get('/tenants/me')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .expect(200);
  });
});
