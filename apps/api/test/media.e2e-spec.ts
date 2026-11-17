import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Header-image uploads: POST /media, the public GET /files/:id link, and an
 * image-header template using the upload. Runs against a REAL MySQL
 * (DATABASE_URL) and WIPES every table the suite touches: use a throwaway DB.
 */
jest.setTimeout(120_000);

/** A real, tiny 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Media uploads + image-header templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const api = '/api/v1';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let adminA: string;
  let adminB: string;

  async function wipe() {
    await prisma.mediaAsset.deleteMany();
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
    process.env.WHATSAPP_MODE = 'mock';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await wipe();

    const reg = await http().post(`${api}/auth/register`).send({ email: 'super@media-e2e.local', password: 'password123', displayName: 'Super' }).expect(201);
    for (const k of ['a', 'b']) {
      await http()
        .post(`${api}/tenants`)
        .set(auth(reg.body.accessToken))
        .send({ name: `Media ${k}`, slug: `media-e2e-${k}`, adminEmail: `admin@media-${k}.local`, adminPassword: 'password123', adminDisplayName: `Admin ${k}` })
        .expect(201);
    }
    adminA = (await http().post(`${api}/auth/login`).send({ email: 'admin@media-a.local', password: 'password123' }).expect(200)).body.accessToken;
    adminB = (await http().post(`${api}/auth/login`).send({ email: 'admin@media-b.local', password: 'password123' }).expect(200)).body.accessToken;
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminA)).expect(201);
  });

  afterAll(async () => {
    await wipe();
    await app.close();
  });

  const upload = (token: string, body: Buffer, type = 'image/png', name = 'My Offer.png') =>
    http().post(`${api}/media`).query({ filename: name }).set(auth(token)).set('X-Forwarded-Proto', 'https').set('Content-Type', type).send(body);

  let fileUrl: string;
  let fileId: string;

  it('requires login to upload', async () => {
    await http().post(`${api}/media`).set('Content-Type', 'image/png').send(PNG).expect(401);
  });

  it('stores a PNG and returns a public link', async () => {
    const res = await upload(adminA, PNG).expect(201);
    expect(res.body).toMatchObject({ filename: 'My_Offer.png', mimeType: 'image/png', sizeBytes: PNG.length });
    expect(res.body.url).toMatch(/\/files\/[0-9a-f-]{36}$/);
    fileUrl = res.body.url;
    fileId = res.body.id;
  });

  it('serves the image publicly (no login) with the right type: this is what Meta fetches', async () => {
    const res = await http()
      .get(`/files/${fileId}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    await http().get('/files/00000000-0000-4000-8000-000000000000').expect(404);
    await http().get('/files/not-a-uuid').expect(400);
  });

  it('rejects files that are not really JPG/PNG, empty bodies and oversize uploads', async () => {
    // Text claiming to be a PNG is caught by the byte check, not the header.
    await upload(adminA, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')).expect(400);
    await upload(adminA, Buffer.alloc(0)).expect(400);
    // Other content types are not parsed as an image at all.
    await upload(adminA, Buffer.from('hello'), 'text/plain').expect(400);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await upload(adminA, big).expect(413);
  });

  it('saves an image-header template with the uploaded link and submits it (mock mode)', async () => {
    const created = await http()
      .post(`${api}/message-templates`)
      .set(auth(adminA))
      .send({ name: 'offer_image', category: 'Marketing', language: 'en', headerType: 'image', headerMediaUrl: fileUrl, body: 'Hi {{1}}, big offer!' })
      .expect(201);
    expect(created.body).toMatchObject({ headerType: 'image', headerMediaUrl: fileUrl, status: 'draft' });
    const submitted = await http().post(`${api}/message-templates/${created.body.id}/submit`).set(auth(adminA)).expect(200);
    expect(submitted.body.status).toBe('approved'); // the mock provider approves immediately
  });

  it('refuses to submit an image template that has no image', async () => {
    const created = await http()
      .post(`${api}/message-templates`)
      .set(auth(adminA))
      .send({ name: 'no_image', category: 'Marketing', language: 'en', headerType: 'image', body: 'No picture' })
      .expect(201);
    expect(created.body.headerMediaUrl).toBeNull();
    const res = await http().post(`${api}/message-templates/${created.body.id}/submit`).set(auth(adminA)).expect(400);
    expect(res.body.message).toMatch(/sample image/i);
  });

  it('does not let another business reuse this upload as its own template sample', async () => {
    await http().post(`${api}/whatsapp-accounts/mock-connect`).set(auth(adminB)).expect(201);
    const created = await http()
      .post(`${api}/message-templates`)
      .set(auth(adminB))
      .send({ name: 'borrowed', category: 'Marketing', language: 'en', headerType: 'image', headerMediaUrl: fileUrl, body: 'x' })
      .expect(201);
    // B does not own the file, so it is treated as an external link and downloaded; the test
    // host is not reachable, so this is a clean 400 rather than a lookup of A's bytes.
    await http().post(`${api}/message-templates/${created.body.id}/submit`).set(auth(adminB)).expect(400);
  });

  it('ignores a media link on non-image headers', async () => {
    const created = await http()
      .post(`${api}/message-templates`)
      .set(auth(adminA))
      .send({ name: 'text_only', category: 'Marketing', language: 'en', headerType: 'text', headerText: 'Hello', headerMediaUrl: fileUrl, body: 'x' })
      .expect(201);
    expect(created.body.headerMediaUrl).toBeNull();
  });
});
