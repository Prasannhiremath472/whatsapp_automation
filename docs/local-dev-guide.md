# Local development guide

## Prerequisites

- Node.js 20+ (tested on 22), pnpm 11 (pinned in the root `package.json`)
- MySQL 8 and Redis — easiest via Docker Desktop (below), or your own installs

## 1. Install

```bash
pnpm install
pnpm --filter @whatsapp-crm/shared-types build
```

## 2. Start MySQL + Redis

```bash
docker compose -f infra/docker-compose.yml up -d
```

- MySQL 8 → `localhost:3307`, db `whatsapp_crm_dev`, user/password `genie`/`genie`
- Redis → `localhost:6380` (BullMQ queues: webhook events + campaign sending)

Using a MySQL/Redis you already run instead? Point `DATABASE_URL` / `REDIS_URL`
in `apps/api/.env` at them.

## 3. Configure

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

In `apps/api/.env` set at least:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | match step 2 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | long random values outside local dev |
| `ENCRYPTION_KEY` | **required to connect a WhatsApp account.** `openssl rand -hex 32`. Never commit it. |
| `WHATSAPP_MODE` | `mock` (default; no Meta account needed) or `live` |
| `BROADCAST_RATE_PER_SECOND` | campaign send rate, default 20 (Meta's ceiling is 80) |

The business app reads `VITE_API_BASE_URL` (default `http://localhost:3000/api/v1`).

## 4. Database

```bash
pnpm --filter @whatsapp-crm/api prisma:generate
pnpm --filter @whatsapp-crm/api exec prisma migrate deploy
pnpm --filter @whatsapp-crm/api seed        # idempotent
```

The seed creates a `super_admin` (`superadmin@dev.local`), two businesses
(`acme-retail`, `bluebird-clinic`) each with an admin and two agents, and — for
Acme Retail — a connected **mock** WhatsApp number, an approved `welcome_offer`
template and eight fictional contacts. Every account uses the dev-only password
`DevPassword123!`.

> **Upgrading a database that already has the old broadcast tables?** The
> `20261116120000_bulk_messaging` migration copies existing broadcast templates
> into `message_templates` and keeps campaigns, but drops per-recipient
> `templateVariables` and renames the `sending` campaign status to `running`.
> Back up first.

## 5. Run

```bash
pnpm dev        # api :3000, business app :5173, admin panel :5174
```

- Business app: http://localhost:5173 → `admin@acme-retail.dev.local`
- The admin panel (`:5174`) still runs on demo data; its sign-in is not yet connected to the API.

## Trying bulk messaging (mock mode)

1. **Contacts** → *Import CSV* (columns: name, phone, email, location, tags). Numbers
   without a country code get the code you enter (default 91).
2. **Templates** → *New template* (name like `diwali_offer`, body `Hi {{1}}, …`) → *Submit*.
   In mock mode it is approved instantly; with real credentials Meta reviews it.
3. **Campaigns** → *Create campaign*: choose audience (all / tag / selected contacts),
   the approved template, how `{{1}}` is filled (e.g. first name, fallback "there"),
   send now or schedule → *Launch*.
4. Watch the campaign: sent → delivered → read counters update live. In mock mode
   delivered/read receipts are simulated through the real webhook queue
   (`MOCK_AUTO_ACK=true`). A number ending in `0000` always fails ("not on WhatsApp")
   so you can see the failure + *Retry failed* flow.
5. Simulate a customer replying **STOP**:
   ```bash
   curl -X POST localhost:3000/dev/simulate-inbound-message -H 'Content-Type: application/json' \
     -d '{"phoneNumberId":"mock-<tenant-id>","fromWaId":"919800000100","text":"STOP"}'
   ```
   The contact is marked opted out and is skipped by every later campaign.
6. Pause / resume / cancel from the campaign list or detail view.

### Going live

Set `WHATSAPP_MODE=live`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`,
then in **WhatsApp Accounts** connect with your Phone number ID, WABA ID and a permanent
access token. Point Meta's webhook at `https://<your-api>/webhook` (unversioned) and
subscribe to `messages` and `message_template_status_update`. The live provider follows
Meta's documented API but has **not been exercised against real credentials yet**.

## Tests

```bash
pnpm --filter @whatsapp-crm/api test        # unit tests, no infrastructure
pnpm --filter @whatsapp-crm/web test        # UI tests with a mocked API
pnpm --filter @whatsapp-crm/api test:e2e    # real MySQL + Redis
```

The e2e suites **delete every row in every table** of the database in
`DATABASE_URL`. Run them against a throwaway database:

```bash
DATABASE_URL="mysql://genie:genie@localhost:3307/whatsapp_crm_test" \
REDIS_URL="redis://localhost:6380" \
pnpm --filter @whatsapp-crm/api exec prisma migrate deploy && \
pnpm --filter @whatsapp-crm/api test:e2e
```

(`http-wiring.e2e-spec.ts` needs no database or Redis.)

On Windows, run `vitest` from a path with an **uppercase drive letter**
(`D:\…`, not `d:\…`) — vitest loads two copies of itself otherwise and every
suite fails with "Cannot read properties of undefined (reading 'config')".

## Troubleshooting

- **`ENCRYPTION_KEY` error when connecting WhatsApp** — set it in `apps/api/.env` (64 hex chars) and restart.
- **Campaign stays "Running" with nothing sent** — a campaign only runs while a worker has Redis; check `REDIS_URL`.
  Only one campaign per business sends at a time; others wait their turn.
- **Campaign paused by itself** — the reason is shown on the campaign (token rejected by Meta, account disconnected, or template no longer approved). Fix it and press *Resume*.
- **CORS error in the browser** — add the app's origin to `CORS_ORIGINS`.
