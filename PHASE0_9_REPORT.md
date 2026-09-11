---
title: "Phase 0.9 — Frontend Latency Resolution Report"
version: "0.9"
date: "2026-09-11"
branch: "remediation/role-model-v2"
base_commit: "e4ba3b9"
tags: [phase-0.9, frontend, pending-closure, vitest, jsdom, readiness]
rules: |
  No role/permission/supplier logic changes. No new migrations.
  Prefer minimal fixes. Document, do not fix, any larger issue found.
---

# PHASE0_9_REPORT

Resolves the two frontend latencies documented in `PHASE0_75_REPORT.md` §8
before Phase 1 (role model rename) starts: the missing `pending_closure`
project status label and the vitest `localStorage is not defined` failure.

## 1. PROJECT_STATUS_LABELS Fix

### Files changed

| File | Change |
|---|---|
| `WMS_Frontend/src/types/index.ts:595` | Added key to `PROJECT_STATUS_LABELS`: `pending_closure: 'Pending Closure'` |
| `WMS_Frontend/src/pages/projects/ProjectsPage.tsx` | `statusBadge` renders `pending_closure` as `<Badge variant="warning">`; list filter dropdown gains the `pending_closure` option |
| `WMS_Frontend/src/pages/projects/ProjectDetailPage.tsx` | `statusBadge` renders `pending_closure` as `<Badge variant="warning">` |
| `WMS_Frontend/src/locales/en/translation.json` | `pages.projects.pendingClosure` = `"Pending Closure"` |
| `WMS_Frontend/src/locales/ar/translation.json` | `pages.projects.pendingClosure` = `"قيد الإغلاق"` |

- **Key added:** `pending_closure: "Pending Closure"` (type label) +
  i18n `pendingClosure` EN `"Pending Closure"` / AR `"قيد الإغلاق"` (AR
  chosen to mirror the existing `قيد الانتظار` "pending" phrasing; the
  backend/handover docs only define the enum value in English, see
  `HANDOVER_REPORT.md:237/264` and migration `036_project_pending_closure.sql`).
- **Status order:** `pending_closure` sits between `open` and `closed`,
  matching the backend lifecycle `open → pending_closure → closed / cancelled`.
- **Related status consumers checked (no other changes needed):**
  - `CreateMaterialRequestPage.tsx:56` filters `p.status === 'open'` for
    selectable projects — correct; pending-closure projects must stay
    non-selectable.
  - `projects.api.ts` accepts `ProjectStatus` for query params — already
    typed.
  - No other `Record<ProjectStatus, …>` / exhaustive switch exists.
- **`npm run typecheck` result:** **CLEAN** (exit 0) — the `TS2741` gap is gone.

## 2. Vitest Environment Fix

| Config | Value |
|---|---|
| Config file created | `WMS_Frontend/vitest.config.ts` |
| Environment | **jsdom** |
| Setup file added | None needed (`auth.store.test.ts` already clears `localStorage` in `beforeEach`) |
| Dependency | `jsdom@^26.0.0` added to `devDependencies` (installed `jsdom@26.1.0`) |
| Related config | `tsconfig.node.json` `include` now covers `vitest.config.ts` |

`vitest.config.ts` mirrors `vite.config.ts` (react plugin + `@` alias) because
vitest falls back to `vite.config.ts` only when no dedicated vitest config
exists.

- **`npm test` result:** **3 suites / 26 tests, all passing** (previously
  `1 failed | 2 passed`, tests 22/22). The 4 additional tests are the
  4 `auth.store.test.ts` cases that were previously unable to collect.

## 3. Full Frontend Verification

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc -b --noEmit`) | **CLEAN** |
| `npm test` (vitest run) | **3 / 3 suites passed, 26 / 26 tests passed** |
| `npm run build` (`tsc -b && vite build`) | **SUCCESS** — `✓ built in 2.88s` (dist output gitignored) |

## 4. Backend Regression Check

| Command | Result |
|---|---|
| `npm test` | **524 / 524 passed** (56 / 56 suites) — unchanged, zero regressions |
| `npx tsc --noEmit` | **CLEAN** |

No backend files were modified in this phase.

## 5. Commits Created

| Commit | Message | Files |
|---|---|---|
| `1ff212c` | fix(frontend): add pending_closure to project status labels | `types/index.ts`, `pages/projects/ProjectsPage.tsx`, `pages/projects/ProjectDetailPage.tsx`, `locales/en/translation.json`, `locales/ar/translation.json` (5) |
| `d2e704b` | test(frontend): configure jsdom environment for vitest | `vitest.config.ts` (new), `package.json`, `package-lock.json`, `tsconfig.node.json` (4) |

Triviality disclosure: the label fix is a small, isolated enums/i18n change;
the vitest change is additive configuration plus one devDependency.

## 6. Phase 1 Readiness Update

| Check | Status |
|---|---|
| Frontend `tsc` clean | ✅ `npm run typecheck` clean |
| Frontend tests green | ✅ 3 suites / 26 tests |
| Frontend build succeeds | ✅ `tsc -b && vite build` success |
| Backend still 524/524 | ✅ unchanged |
| Backend `tsc` still clean | ✅ |
| All committed | ✅ working tree clean at `d2e704b` |

**Verdict: READY FOR PHASE 1**

## 7. Additional Frontend Latencies Discovered

Documented only — **not fixed** (scope discipline; none block Phase 1):

1. **Cosmetic vitest stderr noise:** during `npm test` an
   `ECONNREFUSED`-style `ClientRequest … socketErrorListener` trace prints
   after a passing run. Root cause: `auth.store.logout()` fires a
   fire-and-forget `api.post('/auth/logout', { refreshToken }).catch(() => {})`
   which, under jsdom/vitest, attempts an HTTP call that is caught but emits a
   raw Node socket-error trace to stderr. Exit code 0, all tests pass.
   Phase 1+ candidate: inject/disable the logout POST when `import.meta.env
   .MODE === 'test'` or use mock adapter.
2. **`PROJECT_STATUS_LABELS` is dead-ish:** after the fix it is a valid
   exhaustive record, but grep shows it is only referenced at its own
   definition — badge components render project status via
   `t('pages.projects.*')` translation keys instead (see `ProjectsPage.tsx`
   and `ProjectDetailPage.tsx`). Duplicated mapping source of truth;
   Phase 1 consolidation candidate (no behavior impact).
3. **Project bagde duplication:** the two `statusBadge` implementations in
   `ProjectsPage.tsx` and `ProjectDetailPage.tsx` are near-identical. Minor
   DRY refactor candidate; left as-is to keep the diff minimal.