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
