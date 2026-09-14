---
title: Aiven PostgreSQL Adaptation Report
date: 2026-09-14
branch: remediation/role-model-v2
backend: WMS_Managment_Backend
status: implemented
verification: "tsc clean; 67 suites / 639 tests passing; migrate --verify OK"
---

# AIVEN_ADAPTATION_REPORT.md

## 1. Files Changed

| File | Change |
|------|--------|
| `WMS_Managment_Backend/src/config/database.ts` | Conditional TLS config driven by `DB_SSL` / `DB_SSL_CA_PATH` / `DB_SSL_REJECT_UNAUTHORIZED`; new `getConnectionInfo()`; added `pool.on('connect')` debug log; kept `pool.on('error')` log. |
| `WMS_Managment_Backend/src/utils/env.ts` | Added `DB_SSL` (default `false`), `DB_SSL_REJECT_UNAUTHORIZED` (default `true`), `DB_SSL_CA_PATH` (default `''`) to the Zod schema + typed getters. |
| `WMS_Managment_Backend/src/server.ts` | Startup check now runs `pool.query('SELECT NOW()')` and logs `✅ Database connected (SSL: <bool>, host: <host>)` or `❌ Database connection failed: <msg>`; app starts regardless (no crash on DB outage). |
| `WMS_Managment_Backend/src/app.ts` | `/health` + `/api/health` now include `ssl` and `host`; `db` reports `connected`/`disconnected`; 503 shape keeps `message`+`code` for backward compatibility. |
| `WMS_Managment_Backend/.env.example` | Added the three `DB_SSL_*` vars with local defaults (`DB_SSL=false`). |
| `.env.production.example` (repo root) | Added Aiven section: TLS vars + commented Aiven `DATABASE_URL` + CA path guidance; updated the stale "production forces SSL" note. |
| `WMS_Managment_Backend/certs/.gitkeep` | New tracked placeholder so the `certs/` folder exists for the manual `ca.pem`. |
| `.gitignore` (repo root) | Ignore `certs/*.pem|crt|key` but keep `!certs/.gitkeep`. |
| `WMS_Managment_Backend/tests/db/pool-ssl-config.test.ts` | New unit tests mocking `pg` to assert the pool config for each SSL switch combination. |
| `WMS_Managment_Backend/AIVEN_SETUP.md` | New operator setup guide (committed with the docs commit). |

## 2. SSL Configuration Logic

- **`DB_SSL=true`** → `ssl = { rejectUnauthorized: <from DB_SSL_REJECT_UNAUTHORIZED, default true>, ca: <content of DB_SSL_CA_PATH file when set, otherwise undefined> }`.
  - CA path set → server cert verified against the Aiven CA (`verify-ca`/`verify-full` class).
  - No CA path → TLS on without cert verification (`sslmode ≈ require`).
  - `DB_SSL_REJECT_UNAUTHORIZED=false` → skip verification entirely.
- **`DB_SSL=false`** → no `ssl` in the pool config (explicit opt-out; local dev as before).
- **`DB_SSL` unset** → legacy behavior preserved: `NODE_ENV=production` keeps
  `ssl = { rejectUnauthorized: true }`; otherwise plain connections.
  This guarantees existing LAN/Windows deployments (which currently rely on
  forced production TLS) keep working without any env change. A bad/missing CA
  **path** aborts boot with `fs.readFileSync` — a deliberate fail-fast on a
  configuration error. A failing database *connection* never crashes the app.
- Passwords/full connection strings are never logged; only `hostname` is exposed
  via `getConnectionInfo()`.

## 3. Env Variables Added

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_SSL` | `false` | Enable PostgreSQL TLS (`true` for Aiven). |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Server-certificate verification. |
| `DB_SSL_CA_PATH` | `''` (empty) | Path to `ca.pem` (usually `./certs/ca.pem`). |
| `DATABASE_URL` | (existing, required) | Aiven: use the full Service URI with `?sslmode=require`. |

## 4. Local Dev Impact

**None.** `npm run dev` / `npm test` run with `.env` / `.env.test` where
`DB_SSL` is absent or `false` → the pool config is byte-for-byte the previous
one for non-production. Full test suite passed on the local test database
(67 suites / 639 tests). `npm run migrate -- --verify` connected through the
same shared pool (0 pending, checksums consistent).

## 5. Aiven Setup Steps (summary)

1. Create the Aiven PostgreSQL service; copy Host/Port/User/Password/Database/URI.
2. Download **CA Certificate** → `WMS_Managment_Backend/certs/ca.pem`.
3. Set `DATABASE_URL`, `DB_SSL=true`, `DB_SSL_CA_PATH=./certs/ca.pem` in `.env.production`.
4. `npm run migrate` (runner reuses the shared pool).
5. `npm start` → expect `✅ Database connected (SSL: true, host: <service>.aivencloud.com)`.

Full instructions: **[AIVEN_SETUP.md](WMS_Managment_Backend/AIVEN_SETUP.md)**

## 6. Test Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (backend) | ✅ clean |
| `npx jest --silent` (backend) | ✅ 67 suites / 639 tests (632 existing + 7 new) |
| `db-ssl-config` unit tests | ✅ 7/7 (no SSL local; SSL+CA; SSL no-CA; reject false; legacy production; host scrub) |
| `npm run migrate -- --verify` (local) | ✅ connected via shared pool, 0 pending |
| Health endpoint (`/health`, `/api/health`) | ✅ `db: connected`, `ssl`/`host` present (integration test re-verified) |
| Aiven live handshake | ⏳ Not run — no Aiven instance available; path covered by config unit tests + this guide |

## 7. Residual Risks

- **Scripts that build their own `Pool` bypass the shared config** and, on Aiven,
  would connect without the CA / TLS unless updated: `reset-password.ts`,
  `scripts/{seed-admin,seed-demo-data,seed-users,seed-local-db,reset-dev-data,
  repair-dev-data,seed-campus-data,reset-admin-password,seed-demo,seed-test-data,
  reset-demo-environment,check-admin,check-db-connection,fix-users-missing-department}.ts`.
  App logic and migrations are unaffected (`run-migrations.ts` uses the shared
  pool). Recommended follow-up: extract a `buildPoolConfig()` helper from
  `src/config/database.ts` and have the scripts consume it.
- **`ca.pem` is read relative to the working directory.** Start the backend /
  migrations from `WMS_Managment_Backend` or pass an absolute `DB_SSL_CA_PATH`.
- **Missing CA file fails fast** at boot (`fs.readFileSync`) — intentional, but
  operators must place the cert before first start.
- No hardcoded `localhost` in `src/` app code for the DB path; `assertSafeEnv`
  already refuses loopback `DATABASE_URL` under `NODE_ENV=production`.
- `.env.production.example` keeps `DB_SSL=true` active but `DB_SSL_CA_PATH`
  **commented**, so the existing Windows/LAN flow (which loads that file) never
  reads a not-yet-downloaded cert while still reproducing the previous
  forced-TLS behavior.

## 8. Next Steps

- **Render/Aiven Live:** connect a real Aiven service, run `npm run migrate`,
  confirm the startup banner and `/health` (`db: connected`, `ssl: true`).
- **PgBouncer:** enable Aiven connection pooling if concurrent connections
  approach the plan cap (free ≈ 20–100 directs). Match `pool.max` (currently 20,
  tests 3) to the plan's direct-connection limit; the production guidance is ≤ 10.
- **Operator scripts:** refactor the standalone-pool scripts to reuse the shared
  pool config so backup/seed/reset tooling also works on Aiven.
- **Windows deployment note:** the old "production forces SSL" behavior is
  preserved when `DB_SSL` is unset, so existing deployments are unaffected.