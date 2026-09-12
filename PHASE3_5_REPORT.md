---
title: "Phase 3.5 — Residual RBAC/Flow Gaps Report (D16, D10, D12, M5)"
version: "1.0"
date: "2026-09-12"
branch: "remediation/role-model-v2"
base_commit: "658f94f"
tags: [phase-3.5, rbac, custody-return, inventory, material-requests, distinct-party, wms]
---

# PHASE3_5_REPORT

## 1. Gap D16 — project closure must block while a custody return is pending

### 1.1 Problem

`projectsRepository.close()` blocked closure only while a custody was
`active`. A supervisor-initiated return moves the custody to
`return_pending` (awaiting sub-warehouse-manager confirmation), so a project
could be closed while one of its durable items was physically still out —
the pending RTI was invisible to the closure check.

### 1.2 Fix

- `custodies/custodies.repository.ts` — `countActiveCustodiesByProject` now
  counts `status IN ('active', 'return_pending')`.
- `projects/projects.repository.ts` — `getCloseReport` pending-materials
  query now selects `status IN ('active', 'return_pending')`, so the close
  report lists the mid-return custody and `summary.can_close` is `false`.
- `projects/projects.service.ts` — `close` error message updated to
  "active or return-pending custody record(s)".

### 1.3 Tests

- New `tests/projects/projects-close-return-pending.test.ts`: supervisor
  initiates a return (`return_pending`), `close` is blocked, the close report
  lists the pending custody with `can_close=false`, and closure succeeds only
  after the sub-WH confirms the return.

## 2. Gap D10 — sub-warehouse managers must record counts in Admin-opened sessions

### 2.1 Problem

`POST /api/inventory/sessions/:id/count` required `inventory:count:record`,
which only the Admin role holds. The physical count in a multi-warehouse
department would otherwise have to be done by the Admin alone.

### 2.2 Options considered

- **Option A — new permission** (`inventory:count:record` granted to
  `sub_warehouse_manager`): clean but adds a role-permission grant and a
  migration to alter the stored role definitions.
- **Option B — service-layer scope check** *(chosen)*: keep the permission for
  the Admin, but allow a `sub_warehouse_manager` recording into a session
  opened for one of their **assigned** warehouses. No migration, no new
  permission, no frontend work (there is no inventory-session UI).

### 2.3 Fix (Option B)

- `inventory/inventory.routes.ts` — dropped the `authorize('inventory:count:record')`
  guard on the count route (session open/view/close remain admin-only).
- `inventory/inventory.service.ts` — `recordCount` now takes the authenticated
  user and enforces: holder of `inventory:count:record` (Admin) **or**
  `role === 'sub_warehouse_manager'` whose `warehouse_ids` include the
  session's warehouse; otherwise `ForbiddenError`. Anyone without the
  permission who is not a sub-WM is rejected **before** the session lookup
  (preserves the earlier 403 behaviour for non-admin roles).
- `inventory/inventory.controller.ts` — passes `req.user` through.
- Renamed the stale title in `tests/authorization/inventory-workflow.test.ts`
  ("inventory sessions are admin-only" → open/view/close admin-only, count is
  permission + warehouse-scope gated).

### 2.4 Tests

- New `tests/inventory/inventory-count-scope.test.ts`: assigned sub-WM → 200;
  sub-WM of another warehouse → 403; department manager → 403; open/view/close
  by sub-WM → 403; admin record + close still 200 with zero variances.

## 3. Gap D12 — request catalog must not offer out-of-stock items

### 3.1 Problem

`getRequestCatalog` returned the department's items regardless of balance, so
a supervisor could request an item the warehouse did not have, wasting an
approve/issue cycle (and the issue step had to reject it downstream).

### 3.2 Fix

- `material-requests/material-requests.service.ts` — the catalog items query
  gains `AND i.current_balance > 0`. `items.current_balance` is the single
  source of truth (already mirrored against the primary/main warehouse's
  `item_warehouse_stock`); applying the filter here keeps the backend the
  single source for the frontend request form (`CreateMaterialRequestPage`
  consumes `/api/requests/catalog`), so no frontend change is needed.

### 3.3 Tests

- New `tests/material-requests/catalog-balance.test.ts`: an in-stock item is
  listed; a zero-balance item in the same department/warehouse is excluded;
  catalog shape (department, warehouses, base_unit_code) unchanged.

## 4. Gap M5 — distinct-party confirmation across all two-party flows

Audit of every two-party confirmation flow (creator must never confirm their
own action):

| Flow | Requester | Confirmer | Same-user guard present? | Status |
|---|---|---|---|---|
| PO receive | PO creator (admin) | sub-WH (`purchase_orders:receive`) | Yes — D9 (phase-2-behavior.test.ts) | existing |
| PO transfer | PO creator (admin) | sub-WH (`purchase_orders:transfer`) | Yes — D9 (phase-2-behavior.test.ts) | existing |
| Custody return | supervisor (`custodies:return`) | sub-WH confirmation (`receiveReturn`) | Yes — D15 (phase-2-behavior.test.ts) | existing |
| Material request issue | supervisor (`requests:create`) | sub-WH (`requests:issue`) | Route + service both refuse supervisor issuer | **added** |

- `tests/material-requests/supervisor-request.test.ts` — new test 16: the
  supervising requester cannot issue **their own** request (`403`, status
  stays `pending`). The positive distinct-party path (supervisor requests →
  sub-WH issues) was already covered by the existing suites.
- No source change was required for M5 — permission composition and the
  `requests:issue` guard already enforce distinct parties.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` (backend) | clean |
| Backend suites | `npx jest` | 61 suites / 574 tests pass |
| Frontend typecheck | `npm run typecheck` | clean |
| Frontend tests | `npx vitest run` | 3 files / 26 tests pass |
| Frontend build | `npm run build` | success |

## 6. Test counts

- Before: **58 suites / 560 tests**.
- After: **61 suites / 574 tests** (+3 suites, +14 tests: 4 D16, 7 D10, 2 D12,
  1 M5). No existing test was weakened (only regex/title updates to match the
  new D16 wording).

## 7. Commits

| Commit | Message |
|---|---|
| 1 | `fix(projects): block closure on return_pending custodies (D16)` |
| 2 | `feat(inventory): allow sub-WH to record counts in admin-opened sessions (D10)` |
| 3 | `fix(material-requests): supervisor catalog filters balance > 0 (D12)` |
| 4 | `test(rbac): audit and enforce distinct-party confirmation on all two-party flows (M5)` |
| 5 | `docs(phase3.5): add PHASE3_5_REPORT.md` |

## 8. Residual risks

- D16 limits closure to *confirmed* returns; a `damaged`/`lost` custody is
  marked `unrestored` and correctly remains a non-returning record held against
  the project (still blocks closure) — intentional.
- D10 relies on `user_warehouses` being populated on sub-WH accounts; a
  sub-WH with no assigned warehouses will fail the scope check even for a
  session of their department's warehouse (fail-closed by design).
- Inventory count authorization is enforced twice (route permission for
  open/view/close, service scope for count). If a future route guard is added
  to the count endpoint, it must not re-add `inventory:count:record` only.

## 9. Phase 4 readiness

Checklist:

- [x] Inventory count entry on the floor is no longer admin-only (D10).
- [x] Project closure cannot bypass an in-flight custody return (D16).
- [x] Request catalog never offers out-of-stock items (D12).
- [x] All two-party confirmation flows enforce distinct parties (M5).
- [x] Backend green (61/574), frontend green (typecheck + 26 tests + build).
- [x] No `purchase_requests` work was started; suppliers left untouched.

**Verdict: READY FOR PHASE 4.**