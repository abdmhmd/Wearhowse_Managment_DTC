---
author: opencode (big-pickle)
date-generated: "2026-09-12"
model-id: opencode/big-pickle
phase: 6.1
verdict: RESOLVED (FINDING-1)
highest-severity: HIGH — department-assigned sub_warehouse_manager locked out of Purchase Orders (fixed; regression-tested; full suite green)
status: CLOSED
---

# Phase 6.1 Report — FINDING-1 Fix: DEPARTMENT-Scope Sub-Warehouse Managers Locked Out of Purchase Orders

## 1. Root Cause

- `scopeForUser` (`src/modules/authorization/scope.ts`) resolves a
  `sub_warehouse_manager` **with** `department_id` to data scope `DEPARTMENT`
  — the **mandatory production configuration** per the seeded business rules.
- `poScopeClause` (`src/modules/purchase-orders/purchase-orders.repository.ts`)
  — OLD — handled only `GLOBAL` and `WAREHOUSE`; **`DEPARTMENT` and `NONE`
  fell through to `FALSE`**. A department-assigned manager's list query
  therefore appended `AND (FALSE)` → permanently empty PO list.
- `assertPoInScope` (`src/modules/purchase-orders/purchase-orders.service.ts`)
  — OLD — returned for `GLOBAL`, and in the `WAREHOUSE` branch when
  `po.warehouse_id` was an assigned warehouse; **`DEPARTMENT` (and `NONE`)
  threw `NotFoundError` → `404`** on every single-PO read/update op.
- Why the suite missed it: the shared `seedPoWorld` fixture creates the
  sub-WM manager **without** `department_id` (pure `WAREHOUSE` scope), so no
  scenario exercised the mandatory department-assigned shape.
- Evidence: compiled-`dist` runtime repro of the pre-fix code produced
  `scope=DEPARTMENT → poScopeClause={"clause":"FALSE","params":[]}`, and
  single-PO ops returned `404`.
- The gap was introduced with the Phase 3 purchase-orders module. Scope
  **resolution** in `scope.ts` is correct and intentionally **unchanged** —
  only the PO module's consumption of it was wrong.

## 2. Fix Applied

### `poScopeClause` — `purchase-orders.repository.ts:22-41`
- `GLOBAL` → `TRUE`
- `WAREHOUSE` → zero assigned warehouses ⇒ `FALSE`; else
  `po.warehouse_id = ANY($n)` params `[user.warehouse_ids]`
- **`DEPARTMENT` (NEW)** → identical: assigned warehouses ONLY, fail-closed on
  zero assignments. Never the whole department, never the main warehouse.
- else → `FALSE` (unchanged fail-closed)
- Removed the **dead** WAREHOUSE-branch sub-clause `po.department_id = $n`:
  unreachable because WAREHOUSE-scope users always have `department_id == null`
  (a sub-WM with a department resolves to `DEPARTMENT`, not `WAREHOUSE`).
- Corrected the doc comment that falsely promised "the department's warehouses".

### `assertPoInScope` — `purchase-orders.service.ts:27-45`
- `GLOBAL` → return
- `WAREHOUSE` and `DEPARTMENT` → return when
  `user.warehouse_ids.includes(po.warehouse_id)`
- else → throw `NotFoundError` (unchanged fail-closed `404` for supervisors,
  department_managers, and zero-assignment managers)
- Removed the **unreachable** "own department main warehouse" fallback (old
  `:37-41`): it sat inside the `WAREHOUSE` branch and required
  `user.department_id != null`, which is false for every WAREHOUSE-scope user.

### Reuse, no duplication
- The fix consumes `AuthUserContext.warehouse_ids`, which
  `authorization.service.ts:48-100` reloads fresh from `user_warehouses` on
  **every authenticated request**. No new query, no second source of truth.
- `authorization/scope.ts` was NOT modified.

## 3. Regression Test

- File: `WMS_Managment_Backend/tests/purchase-orders/scope-department.test.ts`
- Fixture: department `D1`; `W1` = **D1's main warehouse** (POs may only
  receive into a MAIN warehouse — `MAIN_WAREHOUSE_REQUIRED`), `W2` = D1's
  sub-warehouse; item in `W1`; `U1` = sub_WM dept `D1` assigned `[W1]`; `U2` =
  sub_WM dept `D1` assigned `[W2]`; `U3` = sub_WM dept `D1` assigned `[]`
  (fail-closed); `admin` creates the PO (receiving into `W1`) and approves it
  (since approval is admin-only).

| # | Case | Expected | Result |
|---|------|----------|--------|
| 1 | `U1` lists POs | non-empty, contains PO | PASS |
| 2 | `U1` GET PO | 200 | PASS |
| 3 | `U1` receive PO | 200, status `received` | PASS |
| 4 | `U1` confirm-transfer (standalone PO) | 400 `NO_LINKED_TRANSFER` (not 404 ⇒ in scope) | PASS |
| 5 | `U2` GET PO (same department, other warehouse) | 404 | PASS |
| 6 | `U2` receive PO | 404 (no side effects) | PASS |
| 7 | `U3` lists POs | empty (fail-closed) | PASS |
| 8 | `U3` GET PO | 404 | PASS |
| 9 | `admin` GET PO (control) | 200 | PASS |

Result: **9/9 PASS.**

## 4. Other Modules Audit — same-defect sweep

| Module | Scope entry point | DEPARTMENT handled? | Behavior correct? | Action needed |
|--------|-------------------|---------------------|-------------------|----------------|
| material-requests | `scopeClause` (generic, `authorization/scope.ts`) over `mr.department_id` + `mr.warehouse_id` (`material-requests.repository.ts:201-207`); service `inScope` (`material-requests.service.ts:389-393`) | YES | YES — dept-scoped caller sees the department's requests plus own-assigned warehouses; creation derived/validated server-side | NONE |
| transactions | `inScope` (`transactions.service.ts:31-56, 75-92`) | YES | YES — DEPARTMENT ⇒ `transaction.department_id = $n OR warehouse/to_warehouse IN dept sub-warehouses` (dept-wide by design, documented) | NONE |
| custodies | `custodyScopeClause` (`custodies.repository.ts:9-30`) | YES | YES — project's department OR assigned user's department (custody is personal/project-owned, not warehouse-scoped) | NONE |
| purchase-requests | `prScopeClause` (`purchase-requests.repository.ts:19-41`) | YES | YES — permission-driven: `view` ⇒ `pr.department_id = $n` for dept-holders, `view_own` ⇒ `created_by`; fail-closed otherwise | NONE |

**Conclusion:** purchase-orders was the **only** module with the DEPARTMENT
gap. No further changes required (and none were applied without approval).

## 5. Verification

| Check | Result |
|-------|--------|
| Backend typecheck (`npx tsc --noEmit`) | PASS (clean) |
| Rebuild + runtime repro of 5 roles against compiled `dist` | PASS — clause strings in §6 |
| New regression suite `scope-department.test.ts` | PASS — 9/9 |
| Full backend suite (`npm test`) | PASS — 63 suites / **607 tests** (598 pre-existing + 9 new; zero regressions) |
| `authorization/scope.ts` untouched | confirmed |
| GLOBAL / WAREHOUSE / NONE paths behavior-identical | confirmed (§6, unchanged suites) |

## 6. Before vs After — actual clause strings

> All values captured from the compiled `dist` runtime (pre-fix @ commit
> `5d2f5b2`; post-fix = rebuilt current tree).

| Role / assignment config | Scope | OLD clause | NEW clause | Behavior change |
|--------------------------|-------|------------|------------|-----------------|
| `admin` (no dept) | GLOBAL | `TRUE` | `TRUE` | none |
| sub-WH, no dept, assigned `[5]` | WAREHOUSE | `(po.warehouse_id = ANY($1))` | `po.warehouse_id = ANY($1)` params `[[5]]` | none — identical rows (only the dead dept sub-clause and parens removed) |
| sub-WH, dept `9`, assigned `[5]` | DEPARTMENT | `FALSE` | `po.warehouse_id = ANY($1)` params `[[5]]` | **FIXED** — sees POs of assigned warehouses; still hidden from the department's other warehouses |
| sub-WH, dept `9`, assigned `[]` | DEPARTMENT | `FALSE` | `FALSE` | none — fail-closed preserved |
| `supervisor`, dept `9` | NONE | `FALSE` | `FALSE` | none |

## 7. Residual Risks

- **Operations note (non-code):** the fix does not auto-grant visibility; a
  production dept-assigned sub-WM must have warehouses in `user_warehouses`
  (typically the department **main** warehouse — POs receive only into main —
  plus any sub-warehouses). Without rows, `DEPARTMENT` still resolves `FALSE`
  → locked out until an administrator assigns them.
- No live-DB E2E was run against the fixed path (the main database has 0
  purchase orders); coverage is API-level regression instead.
- Out-of-scope items still open (tracked, doc-only): FINDING-2 —
  `PHASE5_REPORT.md` §9 wrongly claims permission codes 75/76 remain (they
  were deleted by migration 046); FINDING-3 — stale "allocations" comments at
  `purchase-orders.routes.ts:26` and `transactions.repository.ts:13`.

## 8. Final Sign-off

| Check | Status |
|-------|--------|
| Fix matches the approved decision (assigned-warehouses-only, fail-closed) | ✅ |
| `authorization/scope.ts` not modified | ✅ |
| All pre-existing suites preserved and green | ✅ |
| New regression suite added and green | ✅ |
| Backend typecheck clean | ✅ |
| Full backend suite 607/607 | ✅ |
| Other modules audited — no same defect | ✅ |
| 3 commits authored (fix / test / docs) | ✅ |

**Verdict: SYSTEM FULLY VERIFIED** for FINDING-1. The Phase 6 `ISSUES FOUND`
verdict is thereby **RESOLVED** for its sole HIGH finding; the two minor
doc-only findings remain tracked as recommendations.