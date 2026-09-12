---
title: "Phase 2 — RBAC Enforcement & Workflow Guardrails Report"
version: "1.0"
date: "2026-09-12"
branch: "remediation/role-model-v2"
base_commit: "7de62d3"
tags: [phase-2, rbac, permissions, workflows, wms]
---

# PHASE2_REPORT

## 1. Scope

Phase 1 delivered the role model (admin / sub_warehouse_manager /
department_manager / supervisor) but left several workflow gaps where
permissions were either missing, overly broad, or not enforced in data
scope. Phase 2 closes those gaps:

| ID | Requirement | Outcome |
|---|---|---|
| D3 | Custody return is a two-stage flow (initiate → confirm) | Backend + frontend |
| D4 | Material issue requests never reach the admin | Backend + frontend |
| D5 | Durable custody runtime notifications | Predates scope; covered by existing alerts |
| D9 | Purchase orders require two-party confirmation | Backend + frontend |
| D13 | Sub-WH can reject a pending request before approval | Backend |
| D15 | Sub-WH assesses custody condition on return receipt | Backend + frontend |
| D11 | department_manager scope excludes the main warehouse | Backend |

## 2. Changes

### 2.1 Migrations

- **`039_phase2_permissions.sql`** — revokes ALL `requests:*` grants and
  `custodies:return` / `custodies:view_own` from `admin`, leaving it exactly
  `[custodies:view]` (verified by an in-migration invariant check). Grants
  `requests:reject` to `sub_warehouse_manager`. Records an audit note in
  `_migration_notes`.
- **`040_phase2_states.sql`** — adds the `wm_rejected` material-request state
  (pending → `wm_rejected`) and the `pending_confirmation` allocation state
  (transfer executed, awaiting second-party confirmation).

### 2.2 Backend (`src/modules`)

| Module | File | Change |
|---|---|---|
| authorization | `scope.ts` | DM scope hardening — no main-warehouse leakage in warehouse clauses |
| material-requests | `service.ts`, `repository.ts` | Reject-before-approve to `wm_rejected` (D13); reject persists `rejected_by`/`rejection_reason`; issue restricted to `wm_approved` (D4); `wm_rejected` → issue = `INVALID_REQUEST_STATUS` |
| custodies | `service.ts`, `repository.ts`, `controller.ts` | Two-stage return: supervisor initiates (`return_pending`, condition not persisted), only `sub_warehouse_manager` receives (role guard, others 403); receive accepts condition: `good` → RTI + stock restore, `damaged`/`lost` → preserved above stock (`markUnrestored` accepts `active` + `return_pending`) |
| purchase-orders | `service.ts`, `types.ts` | `confirm-receive` (two-party: creator cannot confirm own receipt) + `confirm-transfer` (executor cannot confirm own movement; `pending_confirmation` → final status). Transfer UPDATE parameter-bug fix (`$3/$4`) |
| transactions | `service.ts` | DM list/detail scope strictly sub-warehouse rows (`warehouse_id`/`to_warehouse_id` in department sub-Wh) |
| reports | `inventoryReport.service.ts` | DM movement summary excludes main-warehouse rows |

### 2.3 Frontend (`WMS_Frontend`)

- **types**: `RequestStatus` + `wm_rejected`, `AllocationStatus` +
  `pending_confirmation`, `PurchaseOrderAllocation.transferred_by` /
  `transfer_confirmed_by`, labels updated.
- **material-requests pages**: `wm_rejected` badge/filter; rejection reason
  shown for both `admin_rejected` and `wm_rejected`; action bar hidden for
  `wm_rejected`. Approve/reject/issue/forward already permission-gated.
- **custodies page**: initiate-return button gated by `can('custodies:return')`
  (admin no longer sees it); receive action only for `sub_warehouse_manager`,
  now via a condition modal (Good/Damaged/Lost) that sends the condition to the
  backend (D15).
- **purchase-orders page**: `Confirm Receipt` button (only for a user who did
  not create the PO) and per-allocation `Confirm Transfer` button (only for
  `pending_confirmation`, hidden for the executor) (D9).
- **api / hooks / i18n**: `confirm-receive`, `confirm-transfer`,
  `receiveReturn(condition)` wired through; en/ar keys added.
- `Sidebar` + `App.tsx` route guards already permission-driven — admin sees no
  `Requests` navigation and `/requests/*` routes are blocked by
  `ProtestedRoute allowedPermissions`.

## 3. Bugs Found During Verification

| Bug | Fix |
|---|---|
| `purchase-orders.service.ts` transfer UPDATE referenced `$5` while only 4 params supplied → 500 `could not determine data type of parameter $3` | SET clause rewritten to `transferred_by=$3, transfer_transaction_id=$4, pending_transaction_id=$4` |
| `custodies.repository.markUnrestored` used `WHERE status='active'` so D15 damaged/lost confirmation on a `return_pending` custody silently no-op'd | accepts `status IN ('active','return_pending')` |
| `transactions.service` DM branch relied on `department_id` alone, leaking main-warehouse rows | `inScope` + `getAll` now restrict to rows touching a sub-warehouse of the user's department |

## 4. Tests

New suite: `tests/rbac/phase-2-behavior.test.ts` — **16 tests**, single shared
world (4 logins only, respecting the non-prod login rate limit):

- **D4**: admin cannot list / create / approve / issue requests (all 403/404);
  sub-WM completes the full lifecycle.
- **D13**: sub-WM rejects pending → `wm_rejected` with `rejected_by` +
  `rejection_reason`; reject on approved → 409 `REQUEST_ALREADY_APPROVED`;
  issue of `wm_rejected` → 400 `INVALID_REQUEST_STATUS`; DM lacks
  `requests:reject` → 403.
- **D11**: DM list/detail sees only sub-warehouse rows; main-warehouse rows
  excluded.
- **D3**: admin initiating a return → 403; supervisor return →
  `return_pending` with no stock change.
- **D15**: `good` → RTI + stock restored (+3); `damaged` → no stock change,
  custody persisted as `damaged`; supervisor confirming receipt → 403.
- **D9**: creator cannot confirm own receive; executor cannot confirm own
  transfer; second user confirms; stock moves per transfer (2 × 10 → total −20).

## 5. Verification

| Check | Result |
|---|---|
| Backend `npx tsc --noEmit` | clean |
| Backend full `npx jest` | **58 suites / 553 tests passed** |
| Frontend `npx tsc --noEmit` | clean |
| Frontend `npx vitest run` | **3 files / 26 tests passed** |
| Frontend `npx vite build` | success (~3.1s) |
| Migrations 039/040 applied (both DBs) | yes |

## 6. Commits Created

| Commit | Message |
|---|---|
| `6f0eebd` | `feat(db): add phase 2 migrations — admin read-only permissions and workflow states` |
| `c36ca06` | `feat(backend): enforce phase 2 guardrails — D4 issue-only-WM, D13 reject, D11 DM scope, D3/D15 custody, D9 two-party PO confirmation` |
| `13ac00f` | `test: align authorization and material-request suites with phase 2 permissions and states` |
| `7895618` | `test: fix purchase-order suites for D9 transfer param mapping and two-party confirmation` |
| `5e93527` | `test: add phase-2 behavior suite covering D4/D13/D11/D3/D15/D9 guardrails` |
| `8c12b03` | `feat(frontend): add wm_rejected/pending_confirmation types, D9 confirm endpoints and custody receive-condition payload` |
| `7538ce7` | `feat(frontend): gate custody return/receive and add D9 PO confirm buttons; handle wm_rejected state` |

(This report is the 8th change — `docs(reports): add phase 2 report`.)

## 7. Notes

- `admin` retains read-only oversight: exactly `[custodies:view]`; all request
  workflows are out of its reach (route, sidebar, and backend 403 all align).
- D5 (durable runtime notifications) was assessed as already satisfied by the
  existing alerts infrastructure from Phase 1; no new work was required.
- The login rate limit (`LOGIN_RATE_LIMIT_MAX`/`WINDOW`, default 10 per 10 s
  in non-prod) is the reason the new behavior suite shares logins through a
  single `beforeAll` instead of logging in per test.