#!/usr/bin/env node
/**
 * Assembles a self-contained, deployable copy of the API for Hostinger shared hosting:
 * compiled code + prisma schema/migrations + shared-types + a package.json with exact,
 * tested dependency versions. Run after `pnpm --filter @whatsapp-crm/shared-types build`
 * and `pnpm --filter api build`.
 *
 *   node scripts/assemble-api-bundle.cjs <outDir>
 *
 * See docs/deployment.md for the full procedure.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!out) {
  console.error("Usage: node scripts/assemble-api-bundle.cjs <outDir>");
  process.exit(1);
}
const apiDir = path.join(root, "apps", "api");
const typesDir = path.join(root, "packages", "shared-types");
for (const required of [path.join(apiDir, "dist", "main.js"), path.join(typesDir, "dist", "index.js")]) {
  if (!fs.existsSync(required)) {
    console.error(`Missing ${path.relative(root, required)}. Build first: pnpm --filter @whatsapp-crm/shared-types build && pnpm --filter api build`);
    process.exit(1);
  }
}

// Keep the old lockfile: the folder is wiped, but package-lock.json speeds up and pins the server install.
const lockPath = path.join(out, "package-lock.json");
const lock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : null;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
if (lock) fs.writeFileSync(lockPath, lock);

const skip = (f) => f.endsWith(".map") || f.endsWith(".d.ts") || f.endsWith(".tsbuildinfo");
fs.cpSync(path.join(apiDir, "dist"), path.join(out, "dist"), { recursive: true, filter: (f) => !skip(f) });

// shared-types: compiled output + a minimal package.json (no workspace: protocol, no dev dependencies)
const st = JSON.parse(fs.readFileSync(path.join(typesDir, "package.json"), "utf8"));
fs.cpSync(path.join(typesDir, "dist"), path.join(out, "shared-types", "dist"), { recursive: true, filter: (f) => !skip(f) });
fs.writeFileSync(
  path.join(out, "shared-types", "package.json"),
  JSON.stringify({ name: st.name, version: st.version, main: st.main, dependencies: st.dependencies }, null, 2) + "\n",
);

// prisma: schema + migrations only
fs.mkdirSync(path.join(out, "prisma"), { recursive: true });
fs.copyFileSync(path.join(apiDir, "prisma", "schema.prisma"), path.join(out, "prisma", "schema.prisma"));
fs.cpSync(path.join(apiDir, "prisma", "migrations"), path.join(out, "prisma", "migrations"), { recursive: true });

// package.json for the server: pin each direct dependency to the exact version tested locally (what pnpm installed).
const api = JSON.parse(fs.readFileSync(path.join(apiDir, "package.json"), "utf8"));
const pinned = {};
for (const name of Object.keys(api.dependencies)) {
  if (name === "@whatsapp-crm/shared-types") continue;
  pinned[name] = JSON.parse(fs.readFileSync(path.join(apiDir, "node_modules", name, "package.json"), "utf8")).version;
}
const deps = { ...pinned, "@whatsapp-crm/shared-types": "file:./shared-types" };
// pnpm tolerates the repo's @nestjs/websockets 11 vs @nestjs/core 10 peer mismatch; npm must be told to.
// (Hostinger skips dotfiles on upload and retries with --legacy-peer-deps by itself; this file is a local safety net.)
fs.writeFileSync(path.join(out, ".npmrc"), "legacy-peer-deps=true\n");
fs.writeFileSync(
  path.join(out, "package.json"),
  JSON.stringify(
    {
      name: "whatsapp-automation-api",
      version: api.version,
      private: true,
      main: "dist/main.js",
      scripts: { start: "node dist/main.js", postinstall: "prisma generate", "migrate:deploy": "prisma migrate deploy" },
      engines: { node: ">=20" },
      dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
    },
    null,
    2,
  ) + "\n",
);

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`Assembled ${out}\n  dist files: ${count(path.join(out, "dist"))}\n  migrations: ${fs.readdirSync(path.join(out, "prisma", "migrations")).filter((d) => /^\d/.test(d)).length}\n  entry: dist/main.js exists = ${fs.existsSync(path.join(out, "dist", "main.js"))}`);
