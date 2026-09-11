---
phase: 0.5
title: Phase 0.5 — Test-Suite Stabilization & Migration-Ledger Drift Review
date: 2026-09-11
status: complete
verdict: PROCEED
baseline: 477 passed / 42 failed / 15 failing suites
result: 524 passed / 0 failed / 56 suites
scope: test stabilization + ledger drift verification ONLY (no role/permission/supplier-logic changes)
---

# PHASE 0.5 REPORT

## 1. Objective

Stabilize the failing test suite and resolve the 019/029 migration-ledger drift
**before** starting the Phase 1 role/permission model work. No roles,
permissions, or supplier *logic* were changed. Every live migration file was
re-verified against both databases (checksums + catalogs).

## 2. Baseline

- Full run before this phase: **477 passed / 42 failed** across **15 failing suites**.
- Failure inventory (42 total):
  - Purchase Orders (36): integration-e2e 1, scope-security 4, crud 5,
    receive-partial 2, allocation 7, status 6, transfer-partial 4,
    availability 2, atomicity 3, concurrency 2.
  - Material Requests (3): inventory-workflow 1, create-hardening 1,
    supervisor-request 1.
  - Custodies (2): custody-return-conditions 2.
  - Suite-level (1): multi-warehouse-targeting failed to compile (TS errors
    against current seed-helper signatures).

## 3. Root-Cause Analysis

All 42 failures were triaged against the code and the fully green/qualified
sibling suites (e.g. `wm-request-flow.test.ts`, which pins the intended
`supplier_id` semantics for WM vs admin creators).

| # | Suite group | Root cause | Category |
|---|-------------|-----------|----------|
| 36 | Purchase Orders | `purchase-orders.service.ts` hardened (NP7-DISBURSEMENT-VS-PURCHASE, in-flight in the working tree) so a **non-WM (admin) creator must supply `supplier_id`** → 400 `SUPPLIER_REQUIRED_FOR_ADMIN_PO`. The suites created admin POs without a supplier. Test-side fix only; no supplier logic touched. | A — test stale vs intentional hardening |
| 1 | create-hardening #6 | Multi-assignment WM targeted assigned `whB`, but **deptB had no main warehouse** → 400 `NO_MAIN_WAREHOUSE` (server-side guard at material-requests.service.ts). | C — fixture gap |
| 1 | supervisor-request #8 | Stale expectation: "payload warehouse ignored → assigned warehouse used (201)". Server now rejects an **unassigned target** (400). The sibling `create-hardening` suite (#4, green) pins the current semantics. | A — test stale vs intentional hardening |
| 1 | inventory-workflow | Same stale "payload ignored (201)" expectation; WM targeted unassigned `whB`. | A — test stale vs intentional hardening |
| 1 | multi-warehouse-targeting | Suite compiled with TS2554/TS2345: seed helpers were called with legacy prefix/name arguments (`seedDepartment(prefix, name)`, `seedWarehouse(prefix, name, opts)`, …) no longer in the signatures. | C — helper-signature drift |
| 2 | custody-return-conditions | Server bug: custody-return RTI used `custody.warehouse_id` (department/request warehouse) as the credit warehouse, but `items.current_balance` only tracks the item's **primary** warehouse (`items.warehouse_id`). Per-warehouse stock was credited while `current_balance` never moved → balance assertions off-by-one. | D — server bug (exposed by test) |
| 1 | allocation **cancel** (inside the 36) | Once the create-400 was removed, the DELETE surfaced a real 500: `purchase_order_allocations.quantity_allocated` is `CHECK (quantity_allocated > 0)`, but cancel set it to `quantity_transferred` = **0** for an untouched reservation → constraint violation. | D — server bug (exposed by test) |
| 1 | scope-security (inside the 36) | `fullWorkflowPo` helper signature lost its `qty` parameter (pre-existing uncommitted tree state) while the body referenced `qty` → suite failed to compile. | C — local helper defect |

## 4. Fixes Applied (committed separately on `remediation/role-model-v2`)

| Commit | Scope | Files |
|--------|-------|-------|
| `71de4d6` test(purchase-orders) | Add `supplier_id: world.supplierId` to every admin PO create across the 10 suites; restore `qty` param in `scope-security` helper. | 10 `tests/purchase-orders/*.test.ts` |
| `3386029` test(material-requests) | supervisor-request #8 + inventory-workflow now expect 400 for unassigned targets; create-hardening seeds deptB main warehouse; multi-warehouse-targeting migrated to current seed signatures (also first commit of this file). | `tests/material-requests/{supervisor-request,create-hardening,multi-warehouse-targeting}.test.ts`, `tests/authorization/inventory-workflow.test.ts` |
| `88c7485` fix(custodies) | RTI return creditted to the item's **primary** warehouse (`items.warehouse_id`, fallback custody warehouse) in both `returnItem` and `receiveReturn`. | `src/modules/custodies/custodies.service.ts` |
| `f06830e` fix(purchase-orders) | `cancelAllocation`: untouched reservations are **deleted** (row cannot legally hold `quantity_allocated=0`); partially-transferred ones clamp `quantity_allocated = quantity_transferred`. NOTE: this file also carries the in-flight NP4/NP5/NP7 hardening already present in the working tree. | `src/modules/purchase-orders/purchase-orders.service.ts` |

## 5. Verification

- `tsc --noEmit`: **clean**.
- Targeted re-run of all previously failing suites: **17/17 suites, 152/152 tests**.
- **Full suite: 56/56 suites, 524/524 tests passed, 0 failed.**
- Delta vs baseline: **42 failed → 0 failed** (524 ≥ 477 baseline passed; the +5
  tests come from the multi-warehouse-targeting suite now compiling and running).

## 6. Migration-Ledger Drift (0.5.2) — RESOLVED, no repair required

Evidence gathered directly via `psql` catalogs on **both** `dtc_wms_test` and
`DTC_WMS_final_db`:

- `_migrations` recordings for 019, 029, 034–037 are **identical** across both
  DBs and **exactly match** the SHA-256 of the current files on disk
  (e.g. 019 → `6f6c6141…`, 029 → `4f735006…`). The ledger is consistent with
  disk **now**; the previously-detected checksum mismatch was a bookkeeping
  artifact that has been reconciled (force re-record), not a schema divergence.
- Live schemas are **catalog-identical**:
  - `request_status` enum: same 8 values in both DBs
    (`pending, dept_approved, forwarded, admin_approved, admin_rejected,
    issued, cancelled, wm_approved`). The `wm_approved` value is intentional —
    added by `032_supervisor_request_routing_and_custody.sql`
    (`ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'wm_approved'`).
  - `projects` date columns: `created_at, updated_at, closed_at, closed_by` in both.
  - `material_requests` triggers: `trg_material_request_warehouse`,
    `trg_mr_updated_at` in both.
  - `suppliers` table present in both; `allocation_status` enum identical in both.
- Cosmetic: the test DB `_migrations` ids have gaps (1,2,3,4,6,7,9,…) vs the
  main DB (1..24) from historical re-runs; filenames+checksums are identical, so
  this is inert.

**Decision:** no corrective `038_fix_019_029_drift.sql` is needed and no
destructive rebuild of `dtc_wms_test` was performed (avoids dropping a live DB).

## 7. Classification Summary (safety categories)

- A — test stale vs intentional hardening: 36 PO + supervisor-request #8 + inventory-workflow = **38**.
- C — fixture/helper/signature drift: create-hardening #6 + multi-warehouse-targeting + scope-security helper = **3**.
- D — server bugs exposed by the above (minimal, behavior-restoring, no
  role/permission/supplier logic): custody RTI primary-warehouse credit +
  cancel-allocation CHECK(>0) handling = **1** (two logical fixes; note the
  custody suite contributed **2** failing tests to the baseline count).

Baseline 42 = 36 PO + 1 + 1 + 1 (MR) + 2 (custody) + 1 (suite-level) ✓.

## 8. Residual Risk / Caveats

- The working tree retains substantial **pre-existing uncommitted** in-flight
  remediation (edited migrations 019/029 + downs, 034–037 untracked-but-applied
  & checksum-verified, purchase-orders/material-requests/transactions/inventory/
  projects/items module changes, WMS_Frontend, handover docs). Those are not
  part of the four commits in §4 and should be reviewed/committed separately.
- Because several source files carry both previous-session hardening and this
  session's fixes, the two source commits bundle that already-present state;
  their messages disclose this explicitly.
- No direct mutation of roles/permissions or supplier logic was made in this
  phase.

## 9. Verdict

- Failures fixed: **42 / 42** (100%).
- Gate: ≥40 → **PROCEED**.

**Phase 0.5 is complete. The suite is fully green (524/524) and the migration
ledger is consistent on disk and across both databases. Phase 1 (role/permission
model) may begin.**