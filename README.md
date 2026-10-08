# WhatsApp CRM SaaS

A multi-tenant CRM platform built on top of WhatsApp, letting businesses manage
customer conversations, broadcasts, and automation from a single dashboard.
This repository is a pnpm + Turborepo monorepo containing the API, the web
frontend, and shared packages.

This codebase is being built out milestone by milestone. **Milestone 1**
(this stage) delivers the foundational platform: multi-tenant data model,
authentication (JWT access/refresh tokens), role-based access control
(`super_admin` / `tenant_admin` / `agent`), and the tenant-isolation seam that
later milestones' business data (contacts, messages, broadcasts, automation)
will plug into. WhatsApp connectivity, inbox, broadcasts, automation, and
billing are out of scope until later milestones.

## Stack

- **API**: NestJS (TypeScript), Prisma ORM, PostgreSQL, JWT auth via
  `@nestjs/passport` + `passport-jwt`, bcrypt password hashing.
- **Web**: React + Vite + TypeScript, TanStack Query, Zustand, Tailwind CSS,
  React Router v6.
- **Infra**: Docker Compose (Postgres 16 + Redis 7 — Redis is provisioned now
  but not consumed by application code until Milestone 2's queue work).
- **Shared**: `@whatsapp-crm/shared-types` — Zod schemas and inferred TS types
  shared between API and web (DTOs, JWT claims, enums).
- **Monorepo tooling**: pnpm workspaces + Turborepo.

## Repository layout

```
apps/
  api/    NestJS backend
  web/    React frontend
packages/
  shared-types/    Zod schemas + types shared by api and web
  tsconfig-base/   Shared strict TypeScript config
infra/
  docker-compose.yml   Postgres + Redis for local dev
  seed/                Idempotent dev seed script
docs/
  local-dev-guide.md   Setup + manual verification checklist
```

## Getting started

See [docs/local-dev-guide.md](docs/local-dev-guide.md) for the full local
setup, environment configuration, database migration/seed steps, and a
manual verification checklist for Milestone 1.
