---
title: WMS Local Revert Report — Frontend & Docs
date: 2026-09-14
status: complete
scope: frontend .env + runtime config, backend env verification, cloud-host cleanup
---

# LOCAL_REVERT_REPORT.md

Final leg of the local-only revert. Backend was already local; this pass
removed the last cloud-host (`*.pxxl.space.cv`) references from the frontend
config so the whole stack runs on `localhost`.

## 1. Files Changed

| File | Before | After |
|---|---|---|
| `WMS_Frontend/.env` (gitignored) | `VITE_API_URL=https://wearhousemanagmentdtc.pxxl.space.cv/api` | `VITE_API_URL=http://localhost:5000/api` |
| `WMS_Frontend/.env.example` | `VITE_API_URL=https://wearhousemanagmentdtc.pxxl.space.cv/api` | `VITE_API_URL=http://localhost:5000/api` (placeholder-safe template) |
| `WMS_Frontend/src/api/client.ts` | fallback `baseURL` was `'https://wearhousemanagmentdtc.pxxl.space.cv/api'` | fallback `baseURL` is `'http://localhost:5000/api'` via `API_BASE_URL` |
| `WMS_Frontend/.gitignore` | no `.env` rule | `.env` / `.env.*` ignored (`.env.example` kept) |
| `WMS_Frontend/vite.config.ts` | already `server.proxy['/api'] → http://localhost:5000` | unchanged (Task 3 — no edit needed) |
| `LOCAL_REVERT_REPORT.md` | previous report (backend pass) | rewritten per this task (YAML front matter) |

## 2. Cloud Host References

| File | Line | Status |
|---|---|---|
| `WMS_Frontend/.env` | 1 | Fixed → `http://localhost:5000/api` |
| `WMS_Frontend/.env.example` | 3 | Fixed → `http://localhost:5000/api` |
| `WMS_Frontend/src/api/client.ts` | 12 | Fixed (fallback → `http://localhost:5000/api`) |
| `WMS_Frontend/package-lock.json` | 518 | Historical / not a host — `"pxxl"` is a coincidental substring inside a base64 `integrity` hash (`@esbuild/android-arm`); left as-is |
| `DEPLOYMENT_WINDOWS.md`, `DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_PREP_REPORT.md`, other `.md`/`.ps1`/`.ts`/`.tsx` | — | No occurrences found; nothing to fix |

Repo-wide scan (all files, excluding `node_modules`, `dist`, `.git`): only the
package-lock base64 coincidence above. **Zero real references to the defunct
host remain.**

## 3. Env Files Summary

| File | DATABASE_URL (masked) | SSL | CORS |
|---|---|---|---|
| `WMS_Frontend/.env` | n/a (API URL only) | n/a | n/a — `VITE_API_URL=http://localhost:5000/api` |
| `WMS_Frontend/.env.example` | n/a | n/a | n/a — `VITE_API_URL=http://localhost:5000/api` |
| `WMS_Managment_Backend/.env` | `postgresql://postgres:********@localhost:5432/DTC_WMS_final_db?sslmode=disable` | unset → **false** (verified via `/api/health` `ssl:false`) | `http://localhost:5173,http://localhost:5000` (includes dev origin) |
| `WMS_Managment_Backend/.env.test` | `postgresql://postgres:123456@localhost:5432/dtc_wms_test?sslmode=disable` | unset → false | `http://localhost:5173,http://localhost:3000` |
| `.env.production` (root, gitignored) | `postgresql://postgres:********@localhost:5432/DTC_WMS_final_db?sslmode=disable` | `DB_SSL=false` | `http://localhost:5173,http://localhost:3000,http://localhost` |
| `WMS_Managment_Backend/.env.production` | does **not exist** — the backend loads `.env` via `dotenv.config()`; the deploy template is the root `.env.production` | — | — |

## 4. Verification Results

| Check | Result |
|---|---|
| Backend typecheck — `npx tsc --noEmit` | ✅ Clean |
| Backend tests — `npm test` | ✅ 639 passed (67 suites) |
| Frontend typecheck — `npx tsc -b --noEmit` | ✅ Clean |
| Frontend tests — `npx vitest run` | ✅ 126 passed (18 files) |
| Backend build — `npm run build` | ✅ Clean |
| Migrations vs local DB — `npm run migrate -- --verify` | ✅ 0 pending, checksums consistent (from previous pass, unchanged DB config) |
| Backend startup — `node dist/server.js` | ✅ `Database connected (SSL: false, host: localhost)` on port 5000 |
| Backend health — `GET /api/health` | ✅ `{ status:"ok", db:"connected", ssl:false, host:"localhost" }` |
| Login API — `POST http://localhost:5000/api/auth/login` | ✅ `success:true`, JWT + `user: { username:"admin", role:"admin" }` |
| Login via Vite dev server — `POST http://localhost:5173/api/auth/login` (proxy → 5000) | ✅ HTTP 200 |
| SPA route — `GET http://localhost:5173/login` | ✅ HTTP 200 |

## 5. Runtime Confirmation

| Item | Result |
|---|---|
| Login works from `http://localhost:5173` | ✅ Yes — verified via the Vite dev server (HTTP 200 + JWT returned); not an automated browser session |
| Network request goes to `http://localhost:5000/api/...` | ✅ Yes — absolute `VITE_API_URL` makes the browser call `localhost:5000` directly; the `/api` proxy to `localhost:5000` was also exercised and returns 200 |
| Backend logs show `Database connected (SSL: false, host: localhost)` | ✅ Yes |
| No request targets the defunct `*.pxxl.space.cv` host | ✅ Yes — no `pxxl.space.cv` / `wearhousemanagmentdtc` references remain |

## 6. Residual Notes

- `WMS_Frontend/package-lock.json:518` — `"pxxl"` is a base64-encoded `integrity` checksum substring for `@esbuild/android-arm`, not a deployment host. Unfixable/irrelevant; noted for auditability.
- Historical deployment docs (`DEPLOYMENT_WINDOWS.md`, `DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_PREP_REPORT.md`) contained **no** cloud-host references, so no edits were needed.
- Uncommitted working-tree files left out of this commit (from an earlier, separate Netlify-prep task): `WMS_Frontend/src/utils/apiErrors.ts` (duplicate-case warning fix) and `WMS_Frontend/public/_redirects` (Netlify SPA rule). Neither affects local runtime.
- `WMS_Managment_Backend/.env` contains a comment with a GitHub PAT (gitignored, uncommitted). Rotate the token and remove the line.
- `DB_SSL` is neither in `WMS_Managment_Backend/.env` nor `.env.test`; the schema defaults it to `false` (`env.ts` z.string().default('false')), confirmed live by `/api/health` returning `ssl:false`.
- Backend SSL code path (`src/config/database.ts`, `src/utils/env.ts`) intentionally untouched — it stays off locally and remains available for future cloud deploys.
- `.env` files are never committed (`.gitignore`); only `.env.example` templates ship.