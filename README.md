# Genie — WhatsApp Business Automation

A multi-tenant platform that lets businesses run WhatsApp conversations,
bulk campaigns and automation from one dashboard. pnpm + Turborepo monorepo.

## Apps

| Path | What it is | Port |
| --- | --- | --- |
| `apps/api` | NestJS REST API (`/api/v1`), Prisma + MySQL, BullMQ + Redis | 3000 |
| `apps/web` | **Business app** — React 19 + Vite + Tailwind 4 (contacts, campaigns, templates, inbox, …) | 5173 |
| `apps/admin` | **Super-admin panel** — React 19 + Vite + Tailwind 4 (businesses, plans, support, …) | 5174 |
| `packages/shared-types` | Zod schemas + TypeScript types shared by the API and both apps | — |
| `infra/` | `docker-compose.yml` (MySQL 8 + Redis), dev seed script | — |

## Status

| Area | Business app (`apps/web`) | Admin panel (`apps/admin`) |
| --- | --- | --- |
| Sign-in / session | **Live** (JWT + refresh) | Demo (browser-only) |
| **Bulk WhatsApp messaging** — contacts, CSV import, templates, campaigns, scheduling, pause/resume, delivery & read tracking, opt-out | **Live** | — |
| WhatsApp account connection | **Live** (Cloud API credentials, encrypted at rest) | Demo |
| Everything else | Demo data (localStorage) | Demo data (localStorage) |

See [docs/backend-roadmap.md](docs/backend-roadmap.md) for what each remaining
screen needs from the backend and the planned order.

## Quick start

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d        # MySQL on :3307, Redis on :6380
cp apps/api/.env.example apps/api/.env                   # then set ENCRYPTION_KEY (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env
pnpm --filter @whatsapp-crm/shared-types build
pnpm --filter @whatsapp-crm/api prisma:generate
pnpm --filter @whatsapp-crm/api exec prisma migrate deploy
pnpm --filter @whatsapp-crm/api seed                     # dev accounts + demo contacts/template
pnpm dev
```

Open http://localhost:5173 and sign in as `admin@acme-retail.dev.local` /
`DevPassword123!` (dev seed only). Full guide: [docs/local-dev-guide.md](docs/local-dev-guide.md).

## Tests

```bash
pnpm --filter @whatsapp-crm/api test        # unit tests (no infrastructure)
pnpm --filter @whatsapp-crm/web test        # UI tests (mocked API)
pnpm --filter @whatsapp-crm/api test:e2e    # needs MySQL + Redis; WIPES the database in DATABASE_URL
```
