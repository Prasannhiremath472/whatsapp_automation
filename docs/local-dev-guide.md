# Local Development Guide

Steps to get Milestones 1 + 2 + 3 running locally: multi-tenant auth platform
(API + web), the WhatsApp webhook + router + mock provider pipeline
(inbound/outbound message flow, exercisable without real Meta credentials),
and the multi-agent shared live inbox (REST send/assign/status + Socket.IO
realtime). Broadcast, automation, and billing land in later milestones.

## Prerequisites

- Node.js 20+ (repo tested with 22.16.0)
- pnpm 11.18.0 (`packageManager` pinned in root `package.json`)
- Docker Desktop (for Postgres + Redis via docker-compose)

## 1. Clone and install

```bash
git clone <repo-url>
cd whatsapp_automation
pnpm install
```

## 2. Start Postgres + Redis

```bash
docker-compose -f infra/docker-compose.yml up -d
```

This starts:
- `postgres:16` on `localhost:5433` (db `whatsapp_crm_dev`, user/pass `postgres`/`postgres` — host port 5433, see the note in `.env.example`)
- `redis:7` on `localhost:6379` — as of Milestone 2 this backs the BullMQ
  `webhook-events` queue used by the webhook pipeline.

## 3. Configure environment variables

Copy the example env files and adjust if needed (defaults match the
docker-compose service above, so no changes are required for a stock local
setup):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

`apps/api/.env.example` documents every variable. As of Milestone 2,
`WHATSAPP_MODE` (`mock` | `live`, default `mock`), `META_WEBHOOK_VERIFY_TOKEN`,
`META_GRAPH_API_VERSION`, and `REDIS_URL` are actively used — the defaults
work out of the box for local dev with the mock provider, no real Meta
credentials needed. `META_APP_ID`/`META_APP_SECRET` are only required if you
switch `WHATSAPP_MODE=live`. `LLM_MODE`/`BILLING_MODE` remain reserved for
later milestones.

## 4. Run database migrations

```bash
pnpm --filter @whatsapp-crm/api prisma:generate
pnpm --filter @whatsapp-crm/api prisma:migrate
```

(`prisma:migrate` runs `prisma migrate dev`, which will prompt for a
migration name on first run — e.g. `init`.)

## 5. Seed demo data (optional but recommended)

The seed script lives at `infra/seed/seed.ts` (kept alongside future fixture
data in `infra/seed/fixtures/`) but reuses the Prisma client generated inside
`apps/api`, so it's run through an `apps/api` script:

```bash
pnpm --filter @whatsapp-crm/api seed
```

This is idempotent — safe to run multiple times. It creates:
- 1 `super_admin`: `superadmin@dev.local`
- 2 demo tenants (`acme-retail`, `bluebird-clinic`), each with 1 `tenant_admin`
  and 2 `agent` users (e.g. `admin@acme-retail.dev.local`,
  `agent1@acme-retail.dev.local`, `agent2@acme-retail.dev.local`)

All seeded accounts share the same **dev-only** password:
`DevPassword123!` (printed by the script when it runs — never use this
password scheme outside local development).

## 6. Run the apps

```bash
pnpm dev
```

This runs both `apps/api` (http://localhost:3000) and `apps/web`
(http://localhost:5173) via Turborepo.

## Manual verification checklist (Milestone 1)

Work through this after seeding (or starting from a clean DB and bootstrapping
manually):

1. **Bootstrap / register the first super-admin** — `POST /auth/register`
   with `{ email, password, displayName }` works with no auth token when the
   database has zero users. Confirm a second call to the same endpoint
   returns `403` once a user exists.
2. **Log in** — `POST /auth/login` with the super-admin's credentials (or the
   seeded `superadmin@dev.local` / `DevPassword123!`) returns an access token,
   refresh token, and user object with no `passwordHash` field.
3. **Create a tenant** — as the super-admin, `POST /tenants` with
   `{ name, slug, adminEmail, adminPassword, adminDisplayName }` creates a
   tenant and its first `tenant_admin` in one transaction.
4. **Log in as that tenant's admin** and confirm:
   - `GET /tenants` (super-admin-only) returns `403`.
   - `GET /tenants/me` returns only their own tenant.
5. **Confirm tenant isolation** — the tenant admin cannot see or affect other
   tenants' data via any endpoint (try guessing another tenant's id in
   `GET /tenants/:id` as a non-super-admin — expect `403`).
6. **Create an agent user** — as the tenant admin, `POST /users` with
   `{ email, password, displayName }` creates an `agent` scoped to the
   caller's own tenant (never trust a `tenantId` in the request body).
   `GET /users` lists only that tenant's users.
7. **Frontend role-gated routing** — log into the web app (http://localhost:5173/login)
   as each role and confirm:
   - `super_admin` lands on `/admin`.
   - `tenant_admin` / `agent` land on `/app`.
   - Visiting the other role's route while logged in redirects away.
   - Logging out and visiting `/admin` or `/app` redirects to `/login`.

## Manual verification checklist (Milestone 2: webhook + router + mock provider)

This exercises the full inbound-message pipeline — `POST /dev/simulate-*` →
BullMQ `webhook-events` queue → `WebhookProcessor` → `RouterService`
(phoneNumberId → tenant) → `InboxService` (Contact/Conversation/Message
upsert) — entirely with the mock WhatsApp provider, no Meta Developer
account or credentials required.

### 1. Mock-connect a WhatsApp number for your tenant

As a `tenant_admin` (get a token via `POST /auth/login`):

```bash
curl -X POST http://localhost:3000/whatsapp-connections/mock-connect \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN"
```

Returns a `WhatsappConnection` with `isMock: true`, `connectionStatus: "connected"`,
and a fabricated `phoneNumberId` like `mock-<tenantId>` — this is the webhook
routing key. Fetch it any time via:

```bash
curl http://localhost:3000/whatsapp-connections/me \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN"
```

### 2. Simulate an inbound message

`POST /dev/simulate-inbound-message` is public (no auth) and only registered
when `NODE_ENV !== 'production'`. It builds a realistic Meta Cloud API
webhook payload internally and enqueues it onto the same `webhook-events`
queue the real `POST /webhook` uses — same code path end to end.

```bash
curl -X POST http://localhost:3000/dev/simulate-inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId": "mock-<tenantId>",
    "fromWaId": "15559998888",
    "fromProfileName": "Jane Customer",
    "text": "Hello, I need help with my order"
  }'
```

Also supports `"messageType": "image"` or `"document"` (with `mediaId`/`caption`
fields — no real file handling in M2, just placeholder metadata), and a
separate status-update simulation:

```bash
curl -X POST http://localhost:3000/dev/simulate-status-update \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId": "mock-<tenantId>",
    "waMessageId": "<a waMessageId from a prior ingested message>",
    "status": "read"
  }'
```

### 3. Verify via the API

Processing is asynchronous (BullMQ worker) — allow a moment, then:

```bash
curl http://localhost:3000/conversations \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN"

curl http://localhost:3000/conversations/<conversationId>/messages \
  -H "Authorization: Bearer $TENANT_ADMIN_TOKEN"
```

Confirm: a `Contact` was upserted with the given `waId`/profile name, a
`Conversation` was created/reused, a `Message` row exists with
`direction: "inbound"` and the expected `messageType`/`content`, and — after
a status-update simulation — that message's `status` field updates
(`queued` → `sent` → `delivered` → `read`, or `failed`).

Also confirm tenant isolation: log in as a **different** tenant's admin and
call `GET /conversations` — it must return an empty list, never another
tenant's data.

### 4. Meta webhook handshake (for reference, not required for local dev)

`GET /webhook` implements Meta's verification handshake. It uses a single
**platform-level** verify token (`META_WEBHOOK_VERIFY_TOKEN` env var, default
`dev-webhook-verify-token`) — Meta's webhook subscription is one app-level
URL shared across all tenants, so there's no per-tenant token to check at
this stage (per-tenant routing happens downstream via `phoneNumberId`, not
here):

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=dev-webhook-verify-token&hub.challenge=abc123"
# -> 200, body: abc123
```

## Manual verification checklist (Milestone 3: multi-agent shared live inbox)

This exercises the new send/assign/status REST endpoints plus the Socket.IO
realtime layer that pushes `message:new` / `conversation:updated` events to
every agent connected on the same tenant.

### 1. Seed two agents in the same tenant

Use the seeded demo data (`pnpm --filter @whatsapp-crm/api seed`) — e.g.
tenant `acme-retail` has `admin@acme-retail.dev.local`,
`agent1@acme-retail.dev.local`, `agent2@acme-retail.dev.local`, all sharing
password `DevPassword123!`. Mock-connect that tenant's WhatsApp number first
(see the M2 section above) if you haven't already.

### 2. Open two browser sessions as two different agents

Open two browser windows (or one normal + one incognito, so localStorage —
where the JWT lives — doesn't collide) at http://localhost:5173/login:

- Window 1: log in as `agent1@acme-retail.dev.local`.
- Window 2: log in as `agent2@acme-retail.dev.local`.

Both land on `/app`; click the **Inbox** link (now a live route, no longer
"coming soon") to reach `/app/inbox` in each window. Each InboxPage mount
opens a Socket.IO connection authenticated with that agent's JWT
(`auth.token` handshake field) and joins the `tenant:{tenantId}` room
server-side (`InboxGateway.handleConnection`).

### 3. Simulate an inbound message and watch it arrive live in both windows

From a terminal, simulate an inbound message the same way as M2:

```bash
curl -X POST http://localhost:3000/dev/simulate-inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId": "mock-<tenantId>",
    "fromWaId": "15557778888",
    "fromProfileName": "Live Inbox Customer",
    "text": "Is anyone available?"
  }'
```

Within a moment (BullMQ processes it, `InboxService.ingestInboundMessage`
persists it and emits `inbox.message.new` on the internal EventEmitter2 bus,
`InboxGateway` relays it as a `message:new` socket event to
`tenant:{tenantId}`), the new conversation should appear at the top of the
conversation list in **both** browser windows without a manual refresh
(TanStack Query cache is invalidated by the `useInboxSocketSync()` listener).

### 4. Send a reply and confirm it's visible everywhere

In Window 1, click the new conversation, type a reply in the compose box,
and hit Send (or Enter). This calls `POST /conversations/:id/messages`,
which creates the outbound `Message` row, calls the mock WhatsApp provider
to get a `waMessageId`, marks the message `sent`, and emits `message:new`
again. Window 2 should show the same reply appear in its chat pane live if
that conversation is open there too, and the conversation list preview
updates in both windows either way.

### 5. Assign the conversation and change its status

In the right-hand contact panel (either window), use the **Assigned agent**
dropdown to assign the conversation to Agent 1 or Agent 2 — this calls
`PATCH /conversations/:id/assign` and both windows receive a
`conversation:updated` event. Toggle **Assigned to me** in the left pane as
each agent to confirm the filter (`GET /conversations?assignedToMe=true`)
only shows conversations assigned to the currently logged-in agent. Use the
**Status** dropdown to move the conversation through
`open` → `pending` → `closed` (`PATCH /conversations/:id/status`) and confirm
the status filter tabs in the left pane reflect it.

### 6. Confirm tenant isolation still holds

Log in as an admin/agent from the *other* seeded tenant (`bluebird-clinic`)
in a third window — its inbox must never show `acme-retail`'s conversations,
and its socket only joins its own `tenant:{tenantId}` room, so it never
receives `acme-retail`'s realtime events either.

## Running tests

```bash
pnpm --filter @whatsapp-crm/api test:e2e
```

Runs the Jest e2e suite (`apps/api/test/auth.e2e-spec.ts` +
`apps/api/test/webhook.e2e-spec.ts` + `apps/api/test/inbox.e2e-spec.ts`)
against `DATABASE_URL`/`REDIS_URL` from `apps/api/.env` — requires Postgres
(step 2) and Redis to be running, and wipes all M1 + M2 + M3 tables at the
start of each suite's run. The script passes `--runInBand`: these e2e suites
share one live Postgres instance and reset its tables in
`beforeAll`/`afterAll`, so running suite files in parallel workers causes one
suite's cleanup to race another's setup — serial execution is required for
determinism, not just a performance choice.

The webhook suite covers, end to end through the real queue: mock-connecting
a tenant's WhatsApp number, the `GET /webhook` verification handshake,
simulating an inbound text message and asserting the Contact/Conversation/
Message land correctly scoped to that tenant, a **tenant-isolation
regression check** (a second tenant must NOT see the first tenant's
conversations), message threading (two inbound messages from the same
contact land in the same conversation), and a status-update simulation
updating the matching message's `status`.

The inbox suite (M3) covers: sending an outbound message via
`POST /conversations/:id/messages` and confirming it appears in
`GET /conversations/:id/messages` with `status: sent` and a `waMessageId`
from the mock provider; assigning/unassigning a conversation via
`PATCH /conversations/:id/assign`, including rejecting an `agentUserId` from
a different tenant; status transitions via `PATCH /conversations/:id/status`;
the `assignedToMe`/`status` query filters on `GET /conversations`; and a
**tenant-isolation regression check** across all four conversation-scoped
endpoints (send/assign/status/messages) — a Tenant B agent must get `404`
(never `403`) hitting a Tenant A conversation id. Socket.IO itself isn't
covered by these e2e tests (harder to test meaningfully under Jest/
Supertest); the realtime layer is verified manually per the checklist above.

## Troubleshooting

- **Prisma can't connect to Postgres**: confirm `docker-compose ps` shows the
  `postgres` service healthy, and that `DATABASE_URL` in `apps/api/.env`
  matches the docker-compose credentials.
- **Port already in use**: change `PORT` in `apps/api/.env` and/or the Vite
  dev server port in `apps/web/vite.config.ts`, and update
  `VITE_API_URL` in `apps/web/.env` to match.
