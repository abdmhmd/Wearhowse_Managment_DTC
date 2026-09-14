# DEPLOYMENT PREP REPORT — WMS Production Readiness (Windows 11, no Docker)

**Date:** 2026-09-13
**Branch:** remediation/role-model-v2 (baseline `2afb112`)
**Target:** Windows 11 server, Node 20 LTS, PostgreSQL 16, IIS, PM2

---

## 1. Objective

Prepare the WMS project for a bare-metal Windows 11 production deployment
without Docker:
environment configuration, build verification, PowerShell operational scripts,
Windows-specific documentation, a copy-paste checklist, a health check for
monitoring, and a security audit.

Everything was done in **PowerShell + Windows file layout** per the constraints:

- ❌ No Docker / docker-compose files
- ❌ No migrations/RBAC/feature changes (code untouched except the one
  approved `/api/health` change)
- ✅ No globals installed (scripts assume `pm2`, Node, PG 16 exist on the server)

---

## 2. Files Created

| File | Purpose |
|---|---|
| `.env.production.example` (root) | Production env template (accurate to what the code actually reads) |
| `scripts/deploy.ps1` | One-shot: pull → `npm ci` → backend/frontend build → migrate → restart (PM2) → health check |
| `scripts/startup.ps1` | Boot-time start: load env, start backend (PM2/`node`), start IIS site, health smoke test, log to `C:\WMS\logs\startup.log` |
| `scripts/backup-db.ps1` | `pg_dump` → `C:\WMS_Backups\wms_YYYYMMDD_HHMMSS.sql` → zip (tar.gz fallback), 30-day retention |
| `scripts/health-check.ps1` | Hit `/api/health`, green + exit 0 on OK, red + exit 1 otherwise |
| `scripts/load-env.ps1` | Export `.env.production` into the shell before `npm run migrate`/`seed:*` |
| `DEPLOYMENT_WINDOWS.md` | Full guide: prereqs, PG + SSL setup, env, IIS + URL Rewrite, PM2/NSSM, firewall, Task Scheduler, verification, update, rollback, troubleshooting |
| `DEPLOYMENT_CHECKLIST.md` | Copy-paste go-live checklist (46-migration check, secret rotation, firewall, backup, etc.) |

## 3. Files Modified

| File | Change |
|---|---|
| `WMS_Managment_Backend/src/app.ts` | `/health` now returns the required shape `{status:'ok', version, db, uptime, timestamp}` on 200 / 503 on DB failure; added `/api/health` alias (both bypass auth + API rate limiter) |
| `WMS_Managment_Backend/tests/integration.test.ts` | Health tests updated to new shape; added unauthenticated `/api/health` case |
| `.gitignore` | Added `.env.*.local`, `coverage/`, `backups/`, `C:/WMS_Backups/`, `*.sql.gz`, `*.sql.zip` |

Full change set: `git status --short` shows exactly those 3 modified + 4 new items
(no stray files).

---

## 4. Health Endpoint

| Path | Auth | Rate-limiter | Returns |
|---|---|---|---|
| `GET /health` | none | — (app-level, not mounted under `/api`) | 200 `{success, data:{status:'ok', version, db:'connected', uptime, timestamp}}`; 503 `SERVICE_UNAVAILABLE` if DB ping fails |
| `GET /api/health` | none | skipped (`req.path === '/health'` inside the limiter) | same |

Verified twice by tests (`integration.test.ts`) and covered by
`scripts/health-check.ps1` + the inline smoke test in `deploy.ps1`/`startup.ps1`.

---

## 5. Build & Test Verification

| Check | Command (working dir) | Result |
|---|---|---|
| Backend build | `npm run build` (`WMS_Managment_Backend`) | ✅ PASS (`tsc`) |
| Backend typecheck | `npm run typecheck` | ✅ PASS |
| Backend tests | `npm test` (needs local `.env.test` DB) | ✅ 65 suites / 628 tests passed (627 + 1 new health test) |
| Frontend build | `npm run build` (`WMS_Frontend`) | ✅ PASS (`tsc -b && vite build`, 689 modules) |
| Frontend typecheck | `npm run typecheck` | ✅ PASS |
| Frontend tests | `npm test` (vitest) | ✅ 14 files / 114 tests passed |

Pre-existing (unrelated) frontend build warning: duplicate `case` clause in
`src/utils/apiErrors.ts:115` (`UNIT_INVALID`/`NO_DEPARTMENT` map to the same
message). Not a new issue, left as-is per the no-silent-fix constraint.

---

## 6. Security Audit

| # | Finding | Severity | Status / Mitigation |
|---|---|---|---|
| 1 | `scripts/seed-admin.ts` + `scripts/reset-admin-password.ts` **hardcode** `admin / Admin@123` | Medium | Documented; `.env.production.example` and `DEPLOYMENT_WINDOWS.md` §4.4 instruct to **rotate the password immediately after first login**. No env-driven seed password in code. |
| 2 | Production forces PostgreSQL **SSL** (`src/config/database.ts`: `rejectUnauthorized: true`; `sslmode=disable` in URL is overridden) | Info (hardening) | Documented end-to-end in `DEPLOYMENT_WINDOWS.md` §2.3 (self-signed cert + `NODE_EXTRA_CA_CERTS`). Checklist item B. |
| 3 | `assertSafeEnv()` refuses boot in production when `DATABASE_URL` is loopback (`localhost`/`127.0.0.1`/`0.0.0.0`/`::1`) | Info (guard) | Documented; template uses `YOUR_SERVER_HOSTNAME` placeholder. |
| 4 | `assertSafeEnv()` refuses the two placeholder JWT values; `JWT_SECRET`/`JWT_REFRESH_SECRET` validated ≥ 32 chars | Info (guard) | Template requires 64-char random secrets; generation command included. |
| 5 | CORS is allowlist-driven (`CORS_ORIGINS` array) — **no wildcard** | Info (ok) | Confirmed `src/app.ts:37`. |
| 6 | Login + token endpoints rate-limited (login: env-driven `LOGIN_RATE_LIMIT_*`; token: fixed 60/15min); general `/api` limiter 200/15 min, health bypassed | Info (ok) | Documented env semantics (fix #2 below). |
| 7 | Passwords hashed with **bcrypt** (`password_hash`); password change invalidates sessions via `token_version` | Info (ok) | Confirmed in users module. |
| 8 | No secrets in tracked files | Info (ok) | `git ls-files` shows only `.env.example` templates; no `.env.production*`, keys or certs committed. Working-tree `.env.production` (if created) stays git-ignored. |
| 9 | `VITE_API_URL` is **not consumed** by the current frontend (`src/api/client.ts` uses relative `/api`); production must reverse-proxy | Low | Documented: IIS URL Rewrite `web.config` shipped in `DEPLOYMENT_WINDOWS.md` §4.3. |
| 10 | Migrations run with `ssl:{rejectUnauthorized:false}` only for **test/dev**; prod migration needs the same SSL trust as the app | Info | Covered by §2.3 docs; `load-env.ps1` + cert trust flow. |

**No critical / high-severity new issues introduced. Two pre-existing
operational risks (predictable seed password, forced-PG-SSL) are documented and
checklisted.**

---

## 7. Manual Steps That Still Need a Human (cannot be scripted from repo)

1. **Move the project** to `C:\WMS` (all scripts default there; current path has
   spaces + a stray `Telegram Desktop` segment).
2. **Install** PostgreSQL 16 + enable SSL (§2.3), create role `wms_user` +
   database `DTC_WMS_final_db` (§2.4).
3. **Install** Node 20 LTS, IIS + URL Rewrite, global `pm2` + `pm2-windows-startup`.
4. **Create `C:\WMS\.env.production`** from the example and fill every
   `CHANGE_ME_*`/`YOUR_SERVER_*` value (hostname, two 64-char JWT secrets,
   PG password, CORS, cert path).
5. **Run the first deploy** and, after seeding, **change the admin password**
   (bootstrap creds are `admin/Admin@123`).
6. **Create the IIS site** `WMS` → `C:\WMS\WMS_Frontend\dist` with the `web.config`
   from §4.3.
7. **Firewall rules** (allow 80, optionally 5000; block 5432) via elevated
   PowerShell (exact commands in §6).
8. **Task Scheduler** entries for startup + daily backup (commands + XML export
   in §7).
9. Backup trial run + confirm `C:\WMS_Backups` has a dump.

---

## 8. Architecture (as deployed)

```
                     ┌──────────────────────────────────────────────┐
Browser (LAN)  ───▶  │ IIS :80  → C:\WMS\WMS_Frontend\dist          │
                     │   ├─ /api/*  → URL Rewrite → localhost:5000  │
                     │   └─ SPA fallback → index.html               │
                     └──────────────────────┬───────────────────────┘
                                            │ 8080 external (IIS proxy)
                     ┌──────────────────────▼───────────────────────┐
                     │ Express (PM2 "wms-backend")  NODE_ENV=prod   │
                     │  http://localhost:5000  (dist/server.js)     │
                     │  /api/health  /health  (monitoring)          │
                     └──────────────────────┬───────────────────────┘
                                            │  pg (SSL, rejectUnauthorized)
                     ┌──────────────────────▼───────────────────────┐
                     │ PostgreSQL 16 :5432 (LOCAL, firewall-blocked)│
                     │  DTC_WMS_final_db (owner wms_user)           │
                     └──────────────────────────────────────────────┘
                 Ops:  deploy.ps1 · startup.ps1 · backup-db.ps1 (Task Sched 03:00)
                       health-check.ps1 · logs under C:\WMS\logs
```

---

## 9. Known Limitations / Open Items

1. **Environment-parsing spread** — `validateEnv()` accepts (harmlessly) `LOG_LEVEL`,
   `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `SEED_ADMIN_*` and the `POSTGRES_*`
   vars, but the app only *consumes* a subset. `.env.production.example` documents
   which are functional vs. convenience vs. unused to prevent confusion.
2. **Frontend proxy dependency** — because the SPA calls a relative `/api`, the
   IIS URL Rewrite rule is a hard requirement; there is no standalone
   `npm run start`-style prod server in the frontend.
3. **Test DB dependency** — `WMS_Managment_Backend/.env.test` + a local test
   database are required for `npm test`. Main project `node_modules` already
   present (no `npm install` performed this run).
4. **`seed:admin` uses `Admin@123`** — rotation is a manual first-login step
   (no change-password API exists; use Users → reset).
5. **Root has no package.json** — scripts/commands are per-app by design;
   `deploy.ps1` encapsulates the whole chain so operators never juggle three
   npm projects by hand.

---

## 10. Next Actions

1. Copy project to `C:\WMS` and follow `DEPLOYMENT_WINDOWS.md` top-to-bottom.
2. Run the checklist in `DEPLOYMENT_CHECKLIST.md`.
3. After go-live: rotate `Admin@123`, verify a backup exists, export the two
   scheduled tasks to `C:\WMS\logs`.