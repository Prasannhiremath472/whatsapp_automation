/**
 * Idempotent dev seed script for Milestone 1.
 *
 * WHY IT LIVES HERE (not apps/api/prisma/seed.ts) AND HOW IT'S RUN:
 * The Prisma schema/client lives in apps/api, but per the infra plan the
 * seed script lives under infra/seed/ alongside future fixture data
 * (infra/seed/fixtures). To reuse the already-generated Prisma client from
 * apps/api without duplicating the schema, this script imports
 * `@prisma/client` resolved from apps/api's node_modules — it is invoked via
 * the `seed` script in apps/api/package.json:
 *
 *   "seed": "ts-node -P ../../infra/seed/tsconfig.json ../../infra/seed/seed.ts"
 *
 * Running it as `pnpm --filter api seed` sets the cwd to apps/api, so
 * DATABASE_URL is picked up from apps/api/.env (via dotenv, loaded below),
 * and Node module resolution for `@prisma/client` finds the client
 * generated into apps/api/node_modules/.prisma/client.
 *
 * Idempotency: every upsert keys off the (tenantId, email) unique
 * constraint (or email alone for the global super_admin, tenantId=null),
 * so re-running this script is always safe and makes no duplicate rows.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as path from "path";
import * as dotenv from "dotenv";

// Load apps/api/.env explicitly since this script is invoked with apps/api
// as the cwd but its source file lives outside that package.
dotenv.config({ path: path.resolve(__dirname, "../../apps/api/.env") });

const prisma = new PrismaClient();

// Dev-only placeholder password for every seeded account. NEVER use this
// (or any hardcoded password) outside local development.
const DEV_PASSWORD = "DevPassword123!";
const BCRYPT_ROUNDS = 10;

async function upsertSuperAdmin() {
  const email = "superadmin@dev.local";
  const existing = await prisma.user.findFirst({ where: { email, tenantId: null } });
  if (existing) {
    console.log(`[seed] super_admin ${email} already exists, skipping`);
    return existing;
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      tenantId: null,
      email,
      passwordHash,
      role: "super_admin",
      displayName: "Dev Super Admin",
    },
  });
  console.log(`[seed] created super_admin ${email}`);
  return user;
}

async function upsertTenantWithUsers(params: {
  name: string;
  slug: string;
  business_category: string | null;
  adminEmail: string;
  agentEmails: [string, string];
}) {
  let tenant = await prisma.tenant.findUnique({ where: { slug: params.slug } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: params.name,
        slug: params.slug,
        business_category: params.business_category,
        status: "active",
      },
    });
    console.log(`[seed] created tenant ${params.slug}`);
  } else {
    console.log(`[seed] tenant ${params.slug} already exists, skipping`);
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: params.adminEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: params.adminEmail,
      passwordHash,
      role: "tenant_admin",
      displayName: `${params.name} Admin`,
    },
  });

  for (const [i, agentEmail] of params.agentEmails.entries()) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: agentEmail } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: agentEmail,
        passwordHash,
        role: "agent",
        displayName: `${params.name} Agent ${i + 1}`,
      },
    });
  }

  console.log(`[seed] ensured admin + ${params.agentEmails.length} agents for ${params.slug}`);
}

/**
 * Demo data for the bulk-messaging screens: a connected (mock) WhatsApp
 * number, an approved template and a handful of fictional contacts, so a
 * campaign can be created and sent end to end on a fresh database. The
 * phone numbers are made up; one ends in 0000, which the mock provider
 * always rejects, to show how failures appear.
 */
async function seedBulkMessagingDemo(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return;

  await prisma.whatsappConnection.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      phoneNumberId: `mock-${tenant.id}`,
      displayPhoneNumber: "+1 555-0100",
      wabaId: `mock-waba-${tenant.id}`,
      connectionStatus: "connected",
      isMock: true,
      webhookVerifyToken: "dev-webhook-verify-token",
      connectedAt: new Date(),
    },
  });

  await prisma.messageTemplate.upsert({
    where: { tenantId_name_language: { tenantId: tenant.id, name: "welcome_offer", language: "en" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "welcome_offer",
      category: "Marketing",
      language: "en",
      body: "Hi {{1}}, thanks for being with us! Our new offers are live — reply STOP to opt out.",
      status: "approved",
      submittedAt: new Date(),
    },
  });

  const names = ["Priya Sharma", "Rahul Mehta", "Ananya Iyer", "Vikram Desai", "Meera Kulkarni", "Arjun Nair", "Sana Sheikh", "Rohan Joshi"];
  const tag = await prisma.tag.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Demo list" } },
    update: {},
    create: { tenantId: tenant.id, name: "Demo list" },
  });
  for (const [i, name] of names.entries()) {
    const waId = i === names.length - 1 ? "919800000000" : `91980000${String(100 + i).padStart(4, "0")}`;
    const contact = await prisma.contact.upsert({
      where: { tenantId_waId: { tenantId: tenant.id, waId } },
      update: {},
      create: { tenantId: tenant.id, waId, displayName: name, email: `${name.toLowerCase().replace(" ", ".")}@example.com`, location: ["Pune", "Mumbai", "Delhi"][i % 3], source: "Seed" },
    });
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
      update: {},
      create: { contactId: contact.id, tagId: tag.id },
    });
  }
  console.log(`[seed] ensured bulk-messaging demo data for ${tenantSlug}`);
}

async function main() {
  console.log("[seed] starting (idempotent — safe to re-run)");
  console.log(`[seed] dev password for ALL seeded accounts: ${DEV_PASSWORD}`);

  await upsertSuperAdmin();

  await upsertTenantWithUsers({
    name: "Acme Retail",
    slug: "acme-retail",
    business_category: "retail",
    adminEmail: "admin@acme-retail.dev.local",
    agentEmails: ["agent1@acme-retail.dev.local", "agent2@acme-retail.dev.local"],
  });

  await upsertTenantWithUsers({
    name: "Bluebird Clinic",
    slug: "bluebird-clinic",
    business_category: "healthcare",
    adminEmail: "admin@bluebird-clinic.dev.local",
    agentEmails: ["agent1@bluebird-clinic.dev.local", "agent2@bluebird-clinic.dev.local"],
  });

  await seedBulkMessagingDemo("acme-retail");

  console.log("[seed] done");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
