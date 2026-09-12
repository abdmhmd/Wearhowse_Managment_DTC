---
title: Phase 4.1 Report — Purchase Request Module (DB + Backend)
version: 1.0
date: 2026-09-12
module: purchase-requests
sub_phase: 4.1
status: complete
branch: remediation/role-model-v2
test_counts: { suites: 66, tests: 612 }
build: tsc --noEmit clean
migrations: released
---

# Phase 4.1 — Purchase Request Module (Database + Backend)

## 1. Migrations

### 043_purchase_requests.sql
- Enum `purchase_request_status` — `pending | dept_approved | admin_approved | rejected | cancelled`
- Sequence `pr_no_seq` for request numbers (`PR-YYYY-XXXXXX`), mirroring `po_no_seq`
- Table `purchase_requests` (+ indexes on `status`, `created_by`, `department_id`, `warehouse_id`)
- Table `purchase_request_items` (+ index on `purchase_request_id`)
- Trigger `trg_purchase_requests_updated_at` maintains `updated_at`
- 1-to-1 link lives on `purchase_requests.purchase_order_id` (UNIQUE → `purchase_orders.id`); circular ref avoided by NOT adding a column to `purchase_orders`
- Note `_migration_notes.phase4_purchase_requests_created`
- Down: drops both tables, sequence, enum, note — replay-safe

### 044_purchase_requests_permissions.sql
- Inserts 8 permissions (`purchase-requests:view|view_own|create|cancel|approve-dept|reject-dept|approve-admin|reject-admin`)
- Grants: `sub_warehouse_manager` → 3, `department_manager` → 3, `admin` → 3, `supervisor` → 0 (9 grant rows total)
- Note `_migration_notes.phase4_purchase_requests_permissions`
- Down: deletes grants + permissions — replay-safe

### Checksums (main DB + test DB)

| File | Checksum | Test DB | Main DB |
|---|---|---|---|
| 043_purchase_requests.sql | 1a3d7ed35b0d… | ✓ | ✓ |
| 044_purchase_requests_permissions.sql | adcffbb29b19… | ✓ | ✓ |

Pending migrations on both DBs: **0**

### `_migration_notes` entries (verified on both DBs)
- `phase4_purchase_requests_created`
- `phase4_purchase_requests_permissions`

## 2. Schema Diagram

```
users ───────────┐
                 ▼
departments ◄── purchase_requests ──► warehouses
                 │ id, request_no (UQ), department_id, warehouse_id,
                 │ created_by, status, notes,
                 │ dept_approved_by/at, admin_approved_by/at,
                 │ rejected_by/rejection_reason/rejected_at,
                 │ cancelled_by/cancelled_at,
                 │ purchase_order_id (UQ ▸ purchase_orders.id)
                 ▼
         purchase_request_items
                 │ id, purchase_request_id (FK, CASCADE), item_id,
                 │ quantity NUMERIC(14,4), unit_code ▸ units(code),
                 │ UNIQUE(purchase_request_id, item_id)
                 │
                 ▼
         purchase_orders ◄── purchase_order_details (items copied verbatim)
```

## 3. Endpoints Added

| Method | Path | Permissions (authorize) | Behavior |
|---|---|---|---|
| GET | /api/purchase-requests | view OR view_own | Scoped list: Sub-WH sees own (created_by = self), Dept Mgr sees dept, Admin sees all. Optional `status` filter |
| GET | /api/purchase-requests/:id | view OR view_own | Detail incl. items; 404 when out of scope |
| POST | /api/purchase-requests | create | Creates request + items, status = `pending`; validates main active warehouse of dept, items belong to dept, units exist |
| PATCH | /api/purchase-requests/:id/cancel | cancel | Creator-only, status must be `pending` → `cancelled` |
| PATCH | /api/purchase-requests/:id/approve-dept | approve-dept | Owner dept only; `pending` → `dept_approved` (404 for other depts) |
| PATCH | /api/purchase-requests/:id/reject-dept | reject-dept | Owner dept only; `pending|dept_approved` → `rejected` + reason |
| PATCH | /api/purchase-requests/:id/approve-admin | approve-admin | `dept_approved` → `admin_approved` + AUTO-CREATE draft PO |
| PATCH | /api/purchase-requests/:id/reject-admin | reject-admin | `dept_approved` → `rejected` + reason |

Guards are 100% permission-based (`hasPermission` / `authorizeAny`). The only `role` usage is data-scoping (view_own vs view), which mirrors the existing production `scopeForUser` convention. Invalid transitions → `409 ConflictError` (`PURCHASE_REQUEST_INVALID_STATUS`; `PURCHASE_REQUEST_ALREADY_PROCESSED` when a PO already exists). Every action writes an audit entry (PR_CREATED, PR_* events).

## 4. Auto-PO Logic (approve-admin)

1. Open a single transaction (`runInTransaction`) and lock the request row `FOR UPDATE`.
2. Verify transition `dept_approved → admin_approved`; verify `purchase_order_id IS NULL` (409 if already processed).
3. Verify request's warehouse is the department's active MAIN warehouse (mirrors the new `enforce_po_main_warehouse` constraint already enforced on POs).
4. Set status = `admin_approved`, `admin_approved_by`, `admin_approved_at`.
5. Generate PO number (`PO-YYYY-XXXXXX` via `po_no_seq`) and insert `purchase_orders` row in `draft` with `supplier_name = ''`, `warehouse_id = request.warehouse_id`, `department_id = request.department_id`.
6. Copy every `purchase_request_items` row into `purchase_order_details` (`unit_price = 0`, quantity preserved) — the admin fills pricing later.
7. Set `purchase_requests.purchase_order_id = new PO id` (the 1-to-1 link).
8. Commit. If **any** step fails (incl. PO number collision), the transaction rolls back: request stays `dept_approved`, no orphan PO, `purchase_order_id` untouched.

Verified by tests: exactly ONE PO per approval; repeated `approve-admin` → 409; failed approval leaves no PO.

## 5. Permission Matrix

| Permission | sub_warehouse_manager | department_manager | admin | supervisor |
|---|---|---|---|---|
| purchase-requests:view | – | ✓ | ✓ | – |
| purchase-requests:view_own | ✓ | – | – | – |
| purchase-requests:create | ✓ | – | – | – |
| purchase-requests:cancel | ✓ | – | – | – |
| purchase-requests:approve-dept | – | ✓ | – | – |
| purchase-requests:reject-dept | – | ✓ | – | – |
| purchase-requests:approve-admin | – | – | ✓ | – |
| purchase-requests:reject-admin | – | – | ✓ | – |

## 6. Test Coverage

New suites: **5** (tests/purchase-requests/) — new tests: **38**

| Suite | Tests | Covers |
|---|---|---|
| create.test.ts | 10 | 201 + pending + PR-YYYY-XXXXXX, no items 400, qty ≤ 0 400, cross-dept item 400, non-main warehouse 400, foreign-dept warehouse 400, unknown unit 400, item-limit 400, supervisor/dept-mgr/admin create 403, DB row count |
| workflow.test.ts | 12 | full happy path create→dept→admin + auto-PO draft, dept reject, admin reject (reason persisted), duplicate approve 409, cancel pending ✓ / cancel after approval 409, reject cancelled 409, other-user cancel 404 |
| permissions.test.ts | 6 | supervisor 403 on every endpoint, sub-WH passes gate (404 on foreign), admin passes gate (404), admin blocked on create, sub-WH blocked on approve/reject, dept-mgr blocked on approve-admin/reject-admin/create/cancel |
| auto-po.test.ts | 5 | exactly one draft PO, supplier_name = '', items copied, purchase_order_id linked, double approve-admin 409, rollback on failure |
| scope.test.ts | 5 | sub-WH sees own only, dept-mgr sees dept only, admin sees all, out-of-scope detail 404, status filter |

Final counts: **66 suites / 612 tests — all green.** Baseline 574 tests preserved (66 suites vs 61 prior).

## 7. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (clean) |
| `npm test` (full backend) | PASS — 66 suites / 612 tests |
| Migration 043 + 044 on TEST DB (dtc_wms_test) | ✓ applied (1a3d7ed35b0d…, adcffbb29b19…) |
| Migration 043 + 044 on MAIN DB (DTC_WMS_final_db) | ✓ applied (1a3d7ed35b0d…, adcffbb29b19…) |
| Pending migrations (both DBs) | 0 |
| `_migration_notes` phase4_* entries (both DBs) | ✓ present |
| permission codes `purchase-requests:*` (both DBs) | 8 present |
| role_permissions grant rows (both DBs) | 9 (sub_WH 3 + dept_mgr 3 + admin 3) |

## 8. Residual Risks

- **Supplier fills PO later:** `supplier_name` starts empty and is filled through the existing PO flow — no automated check yet that it is set before PO approval (unchanged from Phase 2/3 design; PO approval currently does not require supplier_name).
- **No resubmit path:** rejected requests are terminal. If business needs "re-open", a Phase 4.2 workflow addition is required (new permission + endpoint).
- **Item/unit snapshot:** PR items copy `item_id`/`unit_code` only; if an item is renamed/deactivated after approval, the PO shows the new name. `unit_price` starts 0 and is item-level only — no per-dept pricing schema exists above.
- **Concurrency:** approve/reject race is closed by `FOR UPDATE`; list/detail reads are plain (read-committed) — consistent with the rest of the app.
- `purchase-orders` module codes are not yet mirrored in the backend `PERMISSIONS` constant (pre-existing inconsistency); `purchase-requests:*` codes were added normally and are used consistently across routes/audit/tests.

## 9. Phase 4.2 Readiness

- [x] Tables exist on both DBs (purchase_requests, purchase_request_items)
- [x] Permissions granted correctly (8 codes, matrix verified)
- [x] All endpoints functional (8/8 tested)
- [x] Auto-PO creation works (transactional, 1-to-1, tested)
- [x] All tests green (612 / 612)

### Verdict: **READY FOR PHASE 4.2**