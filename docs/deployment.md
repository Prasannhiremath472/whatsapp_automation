# Deploying to Hostinger (shared Business hosting)

Production: API `https://apiwhatsappautomation.infinitytechnohub.com`, web app `https://whatsappautomation.infinitytechnohub.com`.
Database: Hostinger MariaDB (not MySQL). No Redis, no VPS.

## Do not rely on the GitHub auto-deploy

Pushing to `main` can trigger a Hostinger build of the whole monorepo with the site's stored Git settings
(Node 20, pnpm, entry `server.js`). That build **fails** (the repo root has no `server.js`, the API needs
the compiled bundle below). A failed build does not take the site down: the last good deployment keeps
running. Turn the API site's Git auto-deployment off in hPanel (Websites > API site > Git), or delete the
settings with the Hostinger tool `hosting_git_delete-auto-deployment-settings`.

Status: the API site's Git auto-deployment settings were deleted on 2026-11-23 (the last auto-build, for commit
`10bde02`, failed in `pnpm install`: the pinned pnpm 11 needs Node 22.13+). Do not reconnect the repository to
the site; deploy the assembled bundle as described below.

## Deploy the API

1. Build and assemble (from the repo root):
   ```
   pnpm --filter @whatsapp-crm/shared-types build
   pnpm --filter api build
   node scripts/assemble-api-bundle.cjs D:\project\whatsapp_automation_deploy\api
   ```
   The output folder must be **outside** your user profile and temp folders (Hostinger's deploy tool refuses those).
2. If this release added a migration (`apps/api/prisma/migrations`), apply it **before** deploying the code
   (the migrations are additive, so the old code keeps working against the new schema):
   - allow this PC's IPv4 **and IPv6** address to the production database (`hosting_databases_create-remote-connection`),
   - run `prisma migrate deploy` with `DATABASE_URL` pointing at the remote database host,
   - run `prisma migrate diff --from-url ... --to-schema-datamodel ... --exit-code` (expect "No difference"),
   - **remove the access rules again** and confirm `hosting_databases_list-remote-connections` is empty.
3. Deploy the folder (`hosting_deploy`): `type nodejs`, `nodeVersion 22`, `appType express`, `entryFile dist/main.js`,
   `packageManager npm`. Hostinger runs `npm install` (it retries with `--legacy-peer-deps` by itself) and
   `prisma generate` (postinstall), then restarts the app. Takes about 2 to 4 minutes.
4. Wait for the build state `completed` (`hosting_get-deployment`), then verify (below).

Environment variables live on the site (set once with `hosting_nodejs_replace-environment-variables`, which
replaces the whole set; values cannot be read back). Never put secrets in the repo.

## Deploy the web app

```
cd apps/web
$env:VITE_API_BASE_URL = "https://apiwhatsappautomation.infinitytechnohub.com/api/v1"   # PowerShell
pnpm build
```
Copy `dist/` into `D:\project\whatsapp_automation_deploy\web` (keep the `.htaccess` that is already there: SPA
rewrite and caching), then `hosting_deploy` that folder to the web site with `type static`.
Deploy the API first when a change needs new endpoints.

## Verify after every deploy

- `GET /public/v1/openapi.json` returns 200; `GET /api/v1/auth/me` without a token returns 401.
- `GET /webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1` returns 403; an unsigned `POST /webhook` returns 401.
- Sign in as the business admin and open the pages that changed.
- The web index points at the new `assets/index-*.js` file.

## Rollback

Redeploy the previous bundle folder (keep the last good one). Migrations are additive and are not rolled back.
