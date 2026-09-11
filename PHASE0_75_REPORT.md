---
title: "Phase 0.75 — Git Hygiene & Working Tree Stabilization Report"
version: "0.75"
date: "2026-09-11"
branch: "remediation/role-model-v2"
author: "opencode (big-pickle)"
environment: |
  WMS mono-repo @ C:\Users\ASUS\Downloads\Telegram Desktop\WMS
  Backend tests: WMS_Managment_Backend (jest), DB dtc_wms_test
  Typecheck: WMS_Managment_Backend (tsc --noEmit), WMS_Frontend (tsc -b --noEmit)
tags: [phase-0.75, git-hygiene, working-tree, readiness, remediation]
rules: |
  No logic changes. No new migrations. No deletions without evidence.
  Many small logical commits. Disclose pre-existing WIP in every commit.
  Unclear file -> stash + document (none occurred).
---

# PHASE0_75_REPORT

Phase 0.75 is pure Git hygiene over the pre-existing WIP working tree that was
carried through Phase 0.5. Goal: a clean, coherent, reversibly-committed tree
so Phase 1 (role model rename) starts from a known-good state.

## 1. Working Tree Inventory

Snapshot taken at the start of the phase (`git status --porcelain=v1 -uall`).
Every path's purpose was classified before touching it.

### 1.1 Modified (tracked) — 20 files

| # | Path | Purpose | Disposition |
|---|---|---|---|
| 1 | `WMS_Frontend/package.json` | FE tooling (typecheck; lint→tsc gate) | committed `7debdf8` |
| 2 | `WMS_Frontend/src/App.tsx` | Lazy route loading + Suspense/PageLoader | committed `7debdf8` |
| 3 | `WMS_Frontend/src/pages/material-requests/CreateMaterialRequestPage.tsx` | Multi-warehouse target selector | committed `7debdf8` |
| 4 | `WMS_Frontend/src/types/index.ts` | `ProjectStatus`+`pending_closure`, PO `received_at` | committed `7debdf8` |
| 5 | `WMS_Managment_Backend/migrations/019_three_active_roles_and_request_workflow.sql` | Replay-safe enum recreation (DO block) | committed `8730244` |
| 6 | `WMS_Managment_Backend/migrations/019_three_active_roles_and_request_workflow.down.sql` | Cast before status re-mapping | committed `8730244` |
| 7 | `WMS_Managment_Backend/migrations/029_project_system_dates.sql` | `status::text` cast (enum-safe) | committed `8730244` |
| 8 | `WMS_Managment_Backend/package.json` | `typecheck` + `seed:test` scripts | committed `45c4e99` |
| 9 | `WMS_Managment_Backend/src/app.ts` | requestId in global error log | committed `cfe3b28` |
| 10 | `WMS_Managment_Backend/src/middlewares/logger.middleware.ts` | x-request-id / UUID correlation | committed `cfe3b28` |
| 11 | `WMS_Managment_Backend/src/utils/response.ts` | requestId in error bodies | committed `cfe3b28` |
| 12 | `WMS_Managment_Backend/src/modules/inventory/inventory.service.ts` | pass client through batch adjust/approve | committed `718155e` |
| 13 | `WMS_Managment_Backend/src/modules/items/items.repository.ts` | primary-warehouse-gated `current_balance` | committed `718155e` |
| 14 | `WMS_Managment_Backend/src/modules/transactions/transactions.service.ts` | piece unit (H) always valid | committed `718155e` |
| 15 | `WMS_Managment_Backend/src/modules/material-requests/material-requests.service.ts` | explicit assigned-warehouse targeting | committed `e22e69f` |
| 16 | `WMS_Managment_Backend/src/modules/projects/projects.controller.ts` | close-report + initiate-close handlers | committed `177afdf` |
| 17 | `WMS_Managment_Backend/src/modules/projects/projects.repository.ts` | closure workflow queries | committed `177afdf` |
| 18 | `WMS_Managment_Backend/src/modules/projects/projects.routes.ts` | closure routes | committed `177afdf` |
| 19 | `WMS_Managment_Backend/src/modules/projects/projects.service.ts` | closure service logic | committed `177afdf` |
| 20 | `WMS_Managment_Backend/src/modules/purchase-orders/purchase-orders.controller.ts` | confirm-receive / confirm-transfer / cancel-allocation | committed `fba22f0` |
| 21 | `WMS_Managment_Backend/src/modules/purchase-orders/purchase-orders.repository.ts` | `received_at` in PO select | committed `fba22f0` |
| 22 | `WMS_Managment_Backend/src/modules/purchase-orders/purchase-orders.routes.ts` | new PO allocation routes | committed `fba22f0` |

### 1.2 Untracked — 19 files

| # | Path | Purpose | Disposition |
|---|---|---|---|
| 1 | `.github/workflows/ci.yml` | Frontend+backend quality gate CI | committed `65b3781` |
| 2 | `HANDOVER_REPORT.md` | Handover documentation | committed `ba7888b` |
| 3 | `HANDOVER_REPORT_EXHAUSTIVE.md` | Handover documentation (exhaustive) | committed `ba7888b` |
| 4 | `role_model_code_audit.md` | Role-model code audit | committed `ba7888b` |
| 5 | `walkthrough.md` | System walkthrough | committed `ba7888b` |
| 6 | `warehouse_project_discovery.md` | Warehouse/project discovery analysis | committed `ba7888b` |
| 7 | `PHASE0_5_REPORT.md` | Phase 0.5 deliverable | committed `ba7888b` |
| 8 | `WMS_Frontend/src/__tests__/apiErrors.test.ts` | FE unit test (api errors) | committed `7debdf8` |
| 9 | `WMS_Frontend/src/__tests__/auth.store.test.ts` | FE unit test (auth store) | committed `7debdf8` |
| 10 | `WMS_Managment_Backend/_inspect-db.tmp.js` | One-off DB inspection script (contained plaintext DB password) | **Deleted** + gitignored (see §4) |
| 11 | `WMS_Managment_Backend/migrations/034_po_received_at.sql` | Migration (applied, verified 0.5.2) | committed `fba22f0` |
| 12 | `WMS_Managment_Backend/migrations/034_po_received_at.down.sql` | down for 034 | committed `fba22f0` |
| 13 | `WMS_Managment_Backend/migrations/035_po_confirmation.sql` | Migration (applied, verified 0.5.2) | committed `fba22f0` |
| 14 | `WMS_Managment_Backend/migrations/035_po_confirmation.down.sql` | down for 035 | committed `fba22f0` |
| 15 | `WMS_Managment_Backend/migrations/036_project_pending_closure.sql` | Migration (applied, verified 0.5.2) | committed `177afdf` |
| 16 | `WMS_Managment_Backend/migrations/036_project_pending_closure.down.sql` | down for 036 | committed `177afdf` |
| 17 | `WMS_Managment_Backend/scripts/seed-test-data.ts` | Test-data seeding script (`seed:test`) | committed `45c4e99` |

Migration `037_add_custodies_view_own.*` was **already tracked** in a
pre-existing commit (not in the untracked set) — nothing to do.

## 2. Commits Created

All 10 commits are new in this phase, on `remediation/role-model-v2`, below the
four Phase 0.5 commits. Every commit message discloses when the change is
pre-existing WIP.

| Commit | Message | Files | Reason |
|---|---|---|---|
| `ba7888b` | docs(reports): add handover, role-model audit, walkthrough, discovery, and phase 0.5 reports | 6 | Capture pre-existing untracked documentation so the tree is clean |
| `65b3781` | ci(github): add frontend+backend quality gate workflow | 2 | Commit CI pipeline + `.gitignore` pattern for ephemeral inspect scripts |
| `45c4e99` | chore(backend): add typecheck and seed:test npm scripts | 2 | Wire `seed:test` → new `seed-test-data.ts`; add `typecheck` gate |
| `cfe3b28` | feat(infra): correlate request ids through responses and error logs | 3 | Pre-existing NP logging/infra WIP |
| `718155e` | fix(inventory): pass client through batch adjust/approve and gate primary-warehouse balance update | 3 | Pre-existing inventory balance-correctness WIP (incl. piece-unit H rule) |
| `177afdf` | feat(projects): closure workflow with close-report and initiate-close + migration 036 | 6 | Pre-existing NP1 closure WIP + its applied migration 036 |
| `fba22f0` | feat(purchase-orders): confirm-receive, confirm-transfer, cancel-allocation endpoints + migrations 034/035 | 7 | Pre-existing PO WIP (service was already committed `f06830e`) + applied migrations 034/035 |
| `e22e69f` | feat(material-requests): validate explicit assigned-warehouse targeting | 1 | Behavior already covered by `3386029` tests; commit the service side |
| `8730244` | fix(migrations): make 019 enum recreate and 029 status cast replay-safe | 3 | Replay-safe forms already applied to both DBs (verified 0.5.2) |
| `7debdf8` | chore(frontend): lazy route loading, multi-warehouse order selector, types, unit tests, tooling | 6 | Pre-existing frontend WIP + new FE unit tests |

## 3. Stashes Created

| Stash | Message | Files | Reason |
|---|---|---|---|
| — | (none) | — | Every file had a clearly identifiable purpose, so none were stashed. |

## 4. .gitignore Updates

| Pattern Added | Reason |
|---|---|
| `_inspect-*.tmp.js` | Guard clause for ephemeral one-off DB inspection scripts (they embed plaintext `postgres://` connection strings). Also used as the justification to delete `WMS_Managment_Backend/_inspect-db.tmp.js` (file name `.tmp.js` + contents + prior-session usage = explicit evidence it was ephemeral; deletion removes an embedded plaintext DB password from disk). |

## 5. Verification

### `git status` — CLEAN
```
On branch remediation/role-model-v2
nothing to commit, working tree clean
```

### Backend tests
```
Test Suites: 56 passed, 56 total
Tests:       524 passed, 524 total   (previously 477 pass / 42 fail baseline)
Time:        91.3 s
```

### Typecheck
- `WMS_Managment_Backend` → `npx tsc --noEmit` → **CLEAN**.
- `WMS_Frontend` → `npm run typecheck` → **FAILS on a pre-existing latent gap**:
  `src/types/index.ts(595,14) TS2741: 'pending_closure' is missing in type
  Record<ProjectStatus, string>` (see §8, intentionally **not** fixed — no logic
  changes allowed this phase). The CI quality gate runs backend typecheck only.

### Frontend tests (bonus, non-gating)
`npm run test` (vitest): `1 failed | 2 passed (3)`; `Tests 22 passed (22)`.
The failing suite is `auth.store.test.ts` → `ReferenceError: localStorage is
not defined` (test env config gap, pre-existing; see §8).

### Tag
Annotated tag **`phase-0.5-complete`** created at `f06830e` (the Phase 0.5
tip, i.e. the last Phase 0.5 commit; deliberately *before* Phase 0.75 commits
so the tag marks the Phase 0.5 completion point in history).

## 6. Residual State

- **Still modified:** none. Working tree is clean. No file used in Phase 0.5
  was left behind.
- **Intentionally untracked:** none.
- **Deleted with evidence:** `WMS_Managment_Backend/_inspect-db.tmp.js`
  (ephemeral `.tmp.js` inspection script containing a plaintext DB password);
  now covered by `_inspect-*.tmp.js` in `.gitignore`.
- **Untouched by design:** frontend latencies (§8) — documented, not fixed.

## 7. Phase 1 Readiness

| Check | Status |
|---|---|
| Working tree is clean | ✅ `nothing to commit, working tree clean` |
| All applied migrations are committed | ✅ 001–037 tracked; 034/035/036 + 019/029 edits committed this phase; `037_add_custodies_view_own` pre-existing |
| All test-relevant source is committed | ✅ backend src, tests, seed script, tooling, CI all committed |
| Tests still 524/524 | ✅ 56 suites / 524 tests |
| tsc clean | ✅ backend `tsc --noEmit` clean *(frontend typecheck fails on a pre-existing latent gap — see §8, CI only gates backend)* |
| Tag created | ✅ `phase-0.5-complete` @ `f06830e` |
| Stashes documented | ✅ none taken |

**Verdict: READY FOR PHASE 1** (with §8 warnings remediation-ready; they are
frontend-only and non-gating for the backend test/typecheck pipeline).

## 8. Warnings for Phase 1

1. **Frontend typecheck red (pre-existing, emergent):** `WMS_Frontend`'s `lint`
   script was changed to `tsc -b --noEmit` in pre-existing WIP; the compiler
   now surfaces `PROJECT_STATUS_LABELS` missing the `pending_closure` key
   (`src/types/index.ts:595`). Phase 1 should add the mapping.
2. **Frontend test env:** `auth.store.test.ts` fails at collection with
   `localStorage is not defined` — vitest needs a `jsdom`/`happy-dom`
   environment (or a setup file). Pre-existing test-config gap.
3. **Migration numbering:** applied `_migrations` run to id **037**
   (`request_status` now has 8 values incl. `wm_approved` from 032;
   `custodies:view_own` from 037). The Phase 1 role-rename migration must be
   **≥ 038** and must NOT edit already-recorded migration files: `_migrations`
   stores disk SHA-256 and the Phase 0.5.2 ledger verified 019/029/034–037
   still match both DBs. Any rewrite of an applied migration after Phase 0.75
   will break the ledger checksums.
4. **Replay-safety committed:** 019 uses `DROP TYPE IF EXISTS ... CASCADE` in a
   DO block and 029 casts `status::text`. Phase 1 migrations must not assume
   the pre-019 enum shape.
5. **CI never executed:** `.github/workflows/ci.yml` references
   `package-lock.json` (backend lockfile is tracked ✅) but the workflow has
   not run; validate it before the first merge/PR so Phase 1 CI is informative.
6. **Line-ending normalization:** repo normalizes LF→CRLF
   (`core.autocrlf`); git emits cosmetic `LF will be replaced by CRLF`
   warnings. Harmless, flagged for awareness.
7. **Tag placement:** `phase-0.5-complete` points at `f06830e` (pre-0.75), by
   design. Use `git tag --contains` / log if Phase 1 needs to diff against
   the Phase 0.5 tip.

### Suggested Phase 1 first move
Create `038_role_model_rename.sql` (next free number), verify test + main DB
`_migrations` match first, and run the full backend suite before and after.