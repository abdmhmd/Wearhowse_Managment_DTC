# PHASE 0 REPORT — Safety Nets

**Branch:** `remediation/role-model-v2`
**Base:** `4557e6e Update all`
**Date:** 2026-09-11
**Status:** ⚠️ **Test exit criteria NOT met** (see §5, §8). Code is stable; the pre-existing
test failures are reported and left untouched as required by the phase rules.

---

## 1. TypeScript (Task 0.1 — DONE)

- `npx tsc --noEmit` **before**: 4 errors — `TS2322` ×3, `TS2820` ×1, all caused by
  `AuditAction` missing new action literals used by the (uncommitted) project/PO work.
- **Fix:** extended the `AuditAction` union in
  `WMS_Managment_Backend/src/modules/authorization/audit.service.ts`:
  `PROJECT_CLOSURE_INITIATED`, `PO_ALLOCATION_CANCELLED`, `PO_RECEIVE_CONFIRMED`,
  `PO_TRANSFER_CONFIRMED`. `audit_logs.action` is `VARCHAR(50)` (migration 017) — no DB enum.
- `npx tsc --noEmit` **after**: **0 errors**.
- Files changed: `authorization/audit.service.ts` only (the remaining tsc errors lived in
  already-modified working-tree files `projects.controller.ts` / `purchase-orders.controller.ts`,
  which were **not** touched).

## 2. /my-custody route (Task 0.2 — DONE)

- **Root cause:** the frontend guards `/my-custody` with `custodies:view_own`
  (`WMS_Frontend/src/App.tsx:127`, `Sidebar.tsx:49`, `types/index.ts:32`), but the permission
  existed **only** in the frontend catalog.
- **Fix (additive, no grant semantics changed):**
  - `permissions.ts` — added `CUSTODIES_VIEW_OWN: 'custodies:view_own'`.
  - `migrations/037_add_custodies_view_own.sql` (+ `037...down.sql`) — inserts the permission and
    grants it to the roles that can hold a custody: **supervisor, warehouse_manager, system_admin**
    (a custody is assigned to the requester; `department_manager` cannot create requests per 022,
    so it is excluded).
  - Backend data scope for NONE-scope users is already `c.assigned_to = user.id`
    (`custodies.repository.ts`), so the grant only unlocks the route — visible data unchanged.
- **Applied:** main DB `DTC_WMS_final_db` (commit `a79c23b7a87e…`) and test DB `dtc_wms_test`.
- **Test:** `tests/authorization/custodies-view-own.test.ts` — **4/4 passing**
  (catalog present, permission row exists, granted to the 3 roles, NOT granted to department_manager).

## 3. DB backup (Task 0.3 — DONE)

- `scripts/backup-before-remediation.sh` (bash; reads `backend/.env` `DATABASE_URL`, dumps
  `pg_dump --no-owner --no-privileges` to `backend/backups/pre-remediation_<stamp>.sql`).
- **Verified** `pre-remediation_backup.sql` (149,934 bytes) produced successfully.
- `backups/` added to `backend/.gitignore` (was not ignored).
- Usage + restore instructions: `REMEDIATION.md` (project root).

## 4. Test baseline (Task 0.4 — captured; see §8)

`remediation_phase0_test_baseline.txt` (project root) — full `npm test` output:
**41 suites passed / 15 failed, 477 tests passed / 42 failed**, 67s (`--forceExit --detectOpenHandles`).

## 5. Pre-existing hazards observed (REPORTED, NOT fixed — per phase rules)

1. **Migration ledger drift:** migrations `019` and `029` were edited on disk **after** being
   applied. Main-DB ledger already matched disk; **test-DB ledger did not** → applying 037 to the
   test DB required `--force`, which **re-recorded** the 019/029 checksums **without re-running
   their SQL**. Test-DB schema therefore still carries the pre-edit 019/029. Phase 1 must reconcile
   ledger ↔ disk ↔ schema.
2. **Uncommitted working-tree drift:** the 15 failing suites are all in modules changed by earlier
   uncommitted work (material-requests, purchase-orders, custodies, authorization/inventory-workflow),
   e.g. `inventory-workflow` expects 201 but receives 400 on warehouse assignment. Phase 0 did not
   modify those files.
3. Environment: `pg_dump` is not on PATH (PostgreSQL 16 under `C:\Program Files\PostgreSQL\16\bin`);
   the `bash` shim on this machine is a broken WSL relay (`.`sh scripts must run via Git Bash/Linux).

## 6. Git state (Task 0.5)

- New branch `remediation/role-model-v2` from `4557e6e`.
- Commit `chore(remediation): phase 0 safety nets`, staging **only** Phase 0 files:
  `audit.service.ts`, `permissions.ts`, `migrations/037(+.down)`, `tests/authorization/custodies-view-own.test.ts`,
  `scripts/backup-before-remediation.sh`, `backend/.gitignore`, `REMEDIATION.md`,
  `remediation_phase0_test_baseline.txt`, this report.
- The script is committed with the executable bit (`git update-index --chmod=+x`).

## 7. Deliverables

| Deliverable | Path |
|---|---|
| tsc-fixed AuditAction | `backend/src/modules/authorization/audit.service.ts` |
| permission catalog entry | `backend/src/modules/authorization/permissions.ts` |
| migration UP / DOWN | `backend/migrations/037_add_custodies_view_own.sql` / `...down.sql` |
| permission test | `backend/tests/authorization/custodies-view-own.test.ts` |
| backup script | `backend/scripts/backup-before-remediation.sh` |
| backup verification | `backend/backups/pre-remediation_backup.sql` (git-ignored) |
| remediation notes | `REMEDIATION.md` |
| test baseline | `remediation_phase0_test_baseline.txt` |

## 8. Exit criteria

| Criteria | Status |
|---|---|
| `tsc --noEmit` exits 0 | ✅ **Pass** (0 errors) |
| `/my-custody` permission exists + granted + tested | ✅ **Pass** (037 applied, 4/4 tests) |
| DB backup produced & verified | ✅ **Pass** |
| Full test suite green | ❌ **Unmet** — 42 pre-existing failures (see §5.2); fixed outside Phase 0 |
| Selective commit on `remediation/role-model-v2` | ✅ **Pass** |

## 9. Readiness for Phase 1 (P1 — role rename, 7 → 4 roles)

**Not yet** strictly green, but phase 0 safety nets are in place. Phase 1 must:
1. **Reconcile the 019/029 migration-ledger drift** before building more schema (confirm what each
   DB actually contains; align ledger ↔ disk ↔ schema).
2. **Resolve the 42 failing tests** (they cover the exact request/PO behavior P1 touches — they must
   be green before/within P1).
3. Implement the role rename as **migration 038** (`admin`, `sub_warehouse_manager`,
   `department_manager`, `supervisor`) on a new branch `feature/role-model-remediation`, updating
   `ACTIVE_ROLES`, `scope.ts`, service role checks, and seeds per `role_model_code_audit.md`.