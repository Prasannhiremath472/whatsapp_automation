# Backend roadmap — what each screen needs

Both UIs (`apps/web` business app, `apps/admin` super-admin panel) arrived as
prototypes that keep all data in the browser. This is the audit of every screen
against the backend, in the order they will be wired up. Status as of the
bulk-messaging milestone.

Legend: ✅ live on the API · 🟡 partial · ⬜ demo data only (no backend yet)

## Phase 1 — Bulk WhatsApp messaging ✅ (this milestone)

| Screen | Status | Backend |
| --- | --- | --- |
| Sign in / session | ✅ | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` |
| Contacts | ✅ | `/contacts` (search, tag/location/status filters, paging), `/contacts/import` (CSV in chunks, consent required), `/contacts/bulk-tags`, `/contacts/bulk-delete`, `/contacts/export`, `/contacts/tags`; opt-out via STOP |
| Message Templates | ✅ | `/message-templates` CRUD, `/:id/submit` (Meta approval), `/sync` (pull from Meta), webhook `message_template_status_update` |
| Campaigns | ✅ | `/campaigns` create/edit/launch/pause/resume/cancel/retry-failed/delete, `/audience-preview`, `/summary`, `/:id/recipients`; queue worker with rate limit, retries, per-recipient errors, delivered/read tracking, scheduling (business timezone) |
| WhatsApp Accounts | 🟡 | `/whatsapp-accounts` connect with Cloud API credentials (verified with Meta, token encrypted), disconnect, daily limit. **Not yet:** Meta *Embedded Signup* (the "Connect with Facebook" flow) |

Known limits of this phase
- Live Meta calls are written to Meta's documented contract but **untested against real credentials**.
- Templates with image/video/document headers must be created in WhatsApp Manager and pulled in with *Sync from Meta* (Meta requires an uploaded sample); campaigns supply the media URL.
- URL-button variables, carousel/catalog templates and authentication templates are not supported.
- One campaign per business sends at a time (protects the number's rate limit); the rest queue.
- Single API instance assumed for the per-second pacing; the lease/claim logic is multi-instance safe, the pacing is per dispatcher.

## Phase 2 — Inbox, team, profile, dashboard ⬜

| Screen | Needs |
| --- | --- |
| Team Inbox ✅ | Done: the inbox UI uses `/conversations` (polling every few seconds instead of Socket.IO, which is not dependable on shared hosting), mark-as-read, assignment, resolve/reopen, contact notes/tags, the 24-hour reply rule and `POST /conversations/:id/template-messages` for template replies. Not yet: receiving/sending media in chat, internal (private) notes |
| Users & Teams ✅ | Done: list, add user (admin sets the password), change role, deactivate/reactivate (signs them out), admin password reset, last-admin protection. Not yet: teams/groups, invitation emails, fine-grained permissions |
| Profile, Settings ✅ | Done: edit own name, change password (ends all sessions), business name/category/time zone (`PATCH /tenants/me`). Not yet: notification and AI preferences, billing |
| Dashboard, Analytics ✅ | Done: `GET /analytics/overview?range=today\|7d\|30d\|90d` (messages, delivery, conversations, first-reply time, contact growth, campaign funnel, per-day series in the business time zone) and CSV export. Not yet: per-account/campaign/agent filters, AI metrics |
| Help & Support ✅ | Done: tickets (`/support/tickets`: open, reply, close, reopen on reply) shared by the whole business, plus quick guides. Support-team replies need the admin panel backend (Phase 5) |

## Phase 3 — Developer platform ⬜

| Screen | Needs |
| --- | --- |
| API Keys ✅ | Done: `gk_live_` keys, SHA-256 hashed, scoped, optional expiry, revoke, usage counting, shown once |
| Public API ✅ | Done: `/public/v1/messages` (template or text), `/messages/:id`, `/contacts` (list, upsert), `/templates`; 120 requests/minute per key (per API instance) |
| Webhooks ✅ | Done (see Integrations above): events message.received, message.status, conversation.created |
| API Logs ✅ | Done: one row per call (no bodies), 30-day retention, filters and 24 h summary |
| API Docs ✅ | Done: hand-written OpenAPI 3 served live at `/public/v1/openapi.json`, rendered in the app. Not generated from the Zod schemas |
| Channels ✅ | Shows the WhatsApp number status; other channels are marked coming soon |

## Phase 4 — Automation & AI ⬜

| Screen | Needs |
| --- | --- |
| Automations ✅ | Done as rules, not a visual flow builder: trigger (first message / keyword / any message) + ordered steps (send text, send template, tag, assign, set status, wait, pause AI). One automation runs per message; cooldown per chat; waits survive restarts (MySQL-backed scheduler); run history. The old hard-coded school auto-reply is removed. Not yet: branching/conditions, visual canvas, more triggers (inactivity, business hours, tags) |
| AI Agents ✅ | Done with Claude only: each business uses its own Anthropic key (encrypted), agents with instructions + knowledge entries, hand-over to a person (tool call), per-chat on/off, test chat, usage metering. Not yet: PDF/website knowledge import, retrieval over large knowledge, other LLM providers, spend limits |
| Integrations 🟡 | Outgoing webhooks are real (signed, retried, delivery log, SSRF-safe) and work with Zapier/Make/n8n. Shopify, WooCommerce, Google Sheets, HubSpot, Zoho, Salesforce are shown as coming soon (no OAuth built) |
| Commerce bot | Existing backend (catalog, orders, flow). Its old admin screens were in the replaced web app — recoverable from git history (`apps/web/src/pages/CatalogAdminPage.tsx`) and need a home in the new UI |

## Phase 5 — Super-admin backend ⬜

The admin panel's roles (`super_admin`, `support`, `finance`, `operations`) do
not exist server-side yet; `UserRole` has `super_admin`, `tenant_admin`, `agent`.

| Admin area | Needs |
| --- | --- |
| Sign in, forgot/reset password | Admin auth on the real API; password-reset tokens + email; 2FA (Security page) |
| Admin users, Roles | Extend roles + a server-enforced permission matrix (the UI's matrix is cosmetic) |
| Businesses, Onboarding, Client success | Tenant CRUD exists (`/tenants`); add onboarding checklist/state, notes, follow-ups |
| Plans, Subscriptions, Payments, Revenue | Plans/subscriptions/invoices tables, payment provider (Razorpay/Stripe), quota enforcement (messages per plan) |
| AI tokens, providers, usage | Token wallets, provider keys (encrypted), usage ledger |
| Tickets, Requests | Support tickets + threads, shared with the business app |
| Announcements, Notifications, Offers | Broadcast to businesses, in-app notifications |
| Audit / Activity / Error logs, System monitoring | Append-only audit table, error capture, health endpoints and queue stats |
| Platform / business / usage analytics | Cross-tenant aggregates |
| WhatsApp management, Integrations, API management | Cross-tenant views over connections, templates, keys |

## Cross-cutting items to schedule

- **Login hardening:** login currently looks users up by email alone, but emails are only unique *per business*; the same email in two businesses is ambiguous. Add business selection or globally-unique emails, plus rate limiting / lockout.
- **Plan quotas:** meter campaign messages against the plan (Phase 5 dependency).
- **Observability:** structured logs, an admin view of failed webhook events (`webhook_events` rows with `status = 'failed'`), alerting on paused campaigns.
- **Deployment:** Hostinger Node + MySQL only — no Redis. Webhook events are stored in MySQL and campaigns are sent by an in-process worker, both safe to restart. Run a single API instance on shared hosting; if it is ever scaled out, the DB leases and conditional claims already keep instances from sending a message twice.
