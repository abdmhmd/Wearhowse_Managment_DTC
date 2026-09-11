---
title: "Phase 1 — Role Model Rename Report"
version: "1.0"
date: "2026-09-11"
branch: "remediation/role-model-v2"
base_commit: "380382d"
tags: [phase-1, role-model, rename, migration, rbac, wms]
---

# PHASE1_REPORT

## 1. Executive Summary

**Phase 1 (role model rename) is COMPLETE and VERIFIED.** The two legacy role
codes — `system_admin` and `warehouse_manager` — were renamed to the agreed
`admin` and `sub_warehouse_manager` across the database, backend source, seed
scripts, frontend, and the entire test suite, with **zero behavioural
regressions**.

| Check | Result |
|---|---|
| Backend typecheck (`npx tsc --noEmit`) | ✅ clean (exit 0) |
| Backend test suite (`npm test`, jest, DB `dtc_wms_test`) | ✅ **57/57 suites, 536/536 tests** |
| Frontend typecheck (`npx tsc --noEmit`) | ✅ clean (exit 0) |
| Frontend vitest | ✅ **3/3 files, 26/26 tests** |
| Frontend build (`npx vite build`) | ✅ built in ~3s |
| Migration 038 applied | ✅ **`dtc_wms` + `dtc_wms_test`**, checksum-locked |
| Legacy role tokens in seed scripts | ✅ 0 remaining |
| Git working tree | ✅ clean — 5 commits |

## 2. What Changed

Role codes renamed (display names intentionally kept):

| Legacy code | New code | Display (EN / AR) kept |
|---|---|---|
| `system_admin` | `admin` | "System Admin" / "مدير النظام" |
| `warehouse_manager` | `sub_warehouse_manager` | "Warehouse Manager" / "مدير المستودع" |

The 4 active roles are now `admin`, `sub_warehouse_manager`,
`department_manager`, `supervisor`. Legacy `storekeeper`, `accountant`, `viewer`
remain enum values but stay inactive.

## 3. Migration 038

- `WMS_Managment_Backend/migrations/038_role_model_rename.sql` (+ `.down.sql`):
  - Recreates the `user_role` enum with exactly the 4 new labels via a guarded
    `DROP TYPE` / `CREATE TYPE` `DO` block (PostgreSQL has no
    `ALTER TYPE … DROP VALUE`), then re-applies it to `users.role`.
  - Writes `_migration_notes` (`note_key = 'role_rename'`) per renamed user and
    bumps each renamed user's `token_version` (session revocation).
  - Renames the active `roles` table codes and removes the legacy role rows.
  - **No columns were added or dropped** from `users` or any existing table —
    the 038 file contains no `ADD COLUMN` / `DROP COLUMN` statements, no
    index/constraint changes, and no trigger changes.
- > Correction (Phase 1.5): earlier draft versions of this report claimed 038
  > added `admin_username` / `admin_password_hash` "passthrough" columns. They
  > were **never implemented** — they appear in no migration, no code, and no
  > database (verified via `information_schema` on both DBs and a repo-wide
  > search). See `PHASE1_5_REPORT.md`.
- **Applied and checksum-locked on both DBs** (`DTC_WMS_final_db`,
  `dtc_wms_test`) — stored checksum `57edddf2…` matches the disk file exactly.
  The migration files are **final** — no further edits.
- Down migration reverses the rename and drops the `_migration_notes` ledger.

## 4. Behaviour-Critical Fixes

The rename changed `sub_warehouse_manager` **scope resolution**: a
sub_warehouse_manager **with** `department_id` now resolves to `DEPARTMENT`
scope (previously `WAREHOUSE`). This broke 3 guards, all fixed by switching
scope-based checks that gate *creators* to **role-based** checks:

1. `material-requests.service.ts:57` — the "only WM/supervisor/admin can
   create" guard tested `scope === 'DEPARTMENT'`, which wrongly rejected the
   sub_warehouse_manager-with-dept. Now checks
   `user.role === 'department_manager'`.
2. `projects.service.ts` create — the forced department derivation tested
   `scope === 'WAREHOUSE'` (now `DEPARTMENT`), so a WM could create projects for
   a *foreign* department. Now role-based.
3. `projects.service.ts` `resolveAndValidateWarehouse` (default-assigned-
   warehouse + assigned-warehouse-only enforcement) tested `scope === 'WAREHOUSE'`.
   Now role-based. The DM view-only warehouse guard became role-based too.

The scope model itself (`scope.ts`) was **not** changed — by design,
`department_id` presence makes dept managers and sub_WMs resolve to
`DEPARTMENT`; warehouse assignments remain the driver only when no department.

## 5. Files Changed (by area)

| Area | Files | Notes |
|---|---|---|
| Migration | 2 | `038_role_model_rename.sql` / `.down.sql` |
| Backend src | 25 | enums, validators, scope, services, repositories, routes, swagger |
| Scripts | 10 | all seed/repair scripts, zero legacy tokens remaining |
| Frontend | 12 | types, schema, locales, role-gated pages, api, auth.store.test.ts |
| Tests | 28 | 62 `system_admin`→`admin`, 124 `warehouse_manager`→`sub_warehouse_manager`; `auth.test.ts` storekeeper test redesigned as spy-based; new `tests/auth/role-model-rename.test.ts` |

Total: **77 files**.

## 6. New Test Suite — role-model-rename

`WMS_Managment_Backend/tests/auth/role-model-rename.test.ts` locks the contract:

- **AC R1** — DB enum equals the 4 agreed active role codes.
- **AC R2** — `ACTIVE_ROLES` constant is the agreed 4.
- **AC R3** — users validator rejects every legacy code.
- **AC R4** — legacy roles rejected by the login gate (storekeeper).
- **AC R5** — zero `users` rows hold a legacy role (post-migration).
- **AC R6** — `_migration_notes` `role_rename` rows exist for any renamed user
  and each carries `token_version >= 1` (guarded for the test DB, where the
  migrate ran against an empty users table).
- **AC S1** — `scopeForUser` resolution for sub_warehouse_manager with/without
  dept and warehouses.
- **AC S2** — `isWarehouseFallbackUser` matches only zero-assignment
  sub_warehouse_manager.

## 7. Verification Evidence

Backend:

```
Test Suites: 57 passed, 57 total
Tests:       536 passed, 536 total
```

Frontend:

```
Test Files  3 passed (3)
Tests       26 passed (26)
✓ built in 2.97s
```

## 8. Commits (5, logical chunks)

| Commit | Scope |
|---|---|
| `322c254` | `feat(db)` — migration 038 up + down |
| `851108c` | `refactor(backend)` — src role-code rename + scope guards |
| `105dfe6` | `refactor(scripts)` — seed/repair scripts |
| `300a8be` | `refactor(frontend)` — UI role-code rename |
| `c58a012` | `test` — bulk test rename + role-model-rename suite |

## 9. Not In Scope (staged for later phases)

- The **agreed behavioural model** beyond the rename (purchase vs issue request
  split, bilateral custody, admin = main-WH merging, supplier free-text, etc.) —
  those decisions (D2–D16 of `role_model_code_audit.md`) remain **Phase 2+**.
- No permission-matrix changes: `admin` keeps the same grants `system_admin`
  had, `sub_warehouse_manager` the same grants `warehouse_manager` had.
- Physical code removal of legacy enum values (`storekeeper`, `accountant`,
  `viewer`) — kept as values so old data migrates cleanly, deactivated at the
  gate the same way as before.