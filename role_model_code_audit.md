---
title: "Role Model — Code Audit Report"
version: "1.0"
date: "2026-09-11"
audited_commit: "4557e6e42591257f3f17a6fbc6228ab9c888ed20 (main, 2026-08-24; working tree includes uncommitted NP1–NP3 + supervisor-workflow changes)"
auditor: "opencode (big-pickle)"
environment: "WMS_Managment_Backend @ C:\\Users\\ASUS\\Downloads\\Telegram Desktop\\WMS; DB postgresql://postgres:123456@localhost:5432/DTC_WMS_final_db?sslmode=disable; 23 migrations (001–036) applied via `npm run migrate`; dev seed via `npm run seed:test`"
tags: [role-model, audit, rbac, permissions, wms]
---

# Role Model — Code Audit Report

## 1. Executive Summary

**Decisions audited:** 16 (D1–D16). **Verdict: FAIL.** **0/16** fully implemented:
**5 ⛔ Contradicted** (implemented differently than agreed), **2 ❌ Missing** (no implementation), **9 🟡 Partial** (implemented, but with gaps that break the agreed contract).

The agreed model introduces roles (`admin`, `sub_warehouse_manager`) and concepts
(`purchase requests`, `issue requests` as a separate module, `suppliers as free text`,
`pending_confirmation` transfer states) that **do not exist** in the code. The codebase
implements an equivalent-but-different model: `system_admin / warehouse_manager /
department_manager / supervisor` over a single `material_requests` issue flow and a
`sales-side PO` procurement flow (`purchase_orders`). The two models overlap in parts
(supervisor request creation, WM custody returns, two-party PO confirmation) but the
agreed decisions are **not met as written**.

| Decision | Subject | Verdict | Severity |
|---|---|---|---|
| D1 | 4 active roles, legacy rejected at login | ⛔ Contradicted | Critical |
| D2 | Admin merged role (admin = main-WH) | ⛔ Contradicted | Critical |
| D3 | Custody bilateral (Sub-WH ↔ Supervisor only) | ⛔ Contradicted | Critical |
| D4 | Issue requests never reach Admin | ⛔ Contradicted | Critical |
| D5 | Purchase request flow (3-stage gate) | ❌ Missing | Critical |
| D6 | Suppliers external / no table | ⛔ Contradicted | Critical |
| D7 | PO internal record, no "sent" state | 🟡 Partial | Major |
| D8 | Receive auto-transfers (two-party) | 🟡 Partial | Major |
| D9 | Two-party confirmation + pending_confirmation | 🟡 Partial | Major |
| D10 | Cycle counting admin-only + sub-WH records | 🟡 Partial | Major |
| D11 | Dept Manager read-only department scope | 🟡 Partial | Major |
| D12 | Supervisor request-time item scope | 🟡 Partial | Major |
| D13 | Issue request approved by Sub-WH only | 🟡 Partial | Major |
| D14 | Purchase request rejection path | ❌ Missing | Major |
| D15 | Custody condition assessment by Sub-WH only | 🟡 Partial | Major |
| D16 | Project closure blocked by active/return_pending | 🟡 Partial | Major |

## 2. Decision-by-Decision Audit

Legend: ✅ Implemented / 🟡 Partial / ❌ Missing / ⛔ Contradicted. Severity: Critical/Major/Minor.
Every claim carries a citation (`file:line` / `migration` / endpoint / test).

### D1 — Role Model (4 Active Roles) — ⛔ Contradicted (Critical)

- Wire the four agreed role codes into one place:
  - `user_role` enum has **7 values**: `system_admin, warehouse_manager, storekeeper, accountant, department_manager, viewer` (`001_initial_schema.sql:54-57`) + `supervisor` (`027_add_supervisor_role.sql:26`).
  - Roles `admin` and `sub_warehouse_manager` **do not exist** in the enum, `roles` table, code (`src/modules/authorization/permissions.ts`, `users.repository.ts`), or any migration.
- Login gate is defined by `ACTIVE_ROLES = ['system_admin','warehouse_manager','department_manager','supervisor']` (`src/modules/users/users.repository.ts:15-20`), enforced on both login (`auth.controller.ts:33`) and refresh (`auth.controller.ts:109`).
  - **Consequence:** `system_admin` and `warehouse_manager` — the agreement's "legacy roles" to reject — are **explicitly ACTIVE** and pass the gate. Only `storekeeper/accountant/viewer` are deactivated (`019_three_active_roles_and_request_workflow.sql:45-47`) with session revocation (`019:52-55`).
- Recommended rework: rename codes to the agreed names via migration (or extend `ACTIVE_ROLES`/enum to the agreed four) and update the auth gate; update the 7-value enum to the 4 agreed values.

### D2 — Admin Merged Role — ⛔ Contradicted (Critical)

- `system_admin` and `warehouse_manager` are **two distinct roles**: separate enum values (`001:54-57`), separate `roles` rows (`017`), separate grant sets (`017_rbac_permissions.sql:176-208`), and `scope.ts` models them differently (`scopeForUser` `GLOBAL` vs `WAREHOUSE`, `src/modules/authorization/scope.ts:14-21`).
- `019` does **not** merge them; it re-frames `warehouse_manager` as *"operational read-only"* separate from `system_admin` (`019:1-16`), reinforcing the two-role split that D2 forbids.
- No merged-role code, migration, or type exists.

### D3 — Custody is Bilateral (Sub-WH ↔ Supervisor only) — ⛔ Contradicted (Critical)

- Permission catalog contains only `custodies:view` and `custodies:return`; **no** `custodies:create`, **no** `custodies:assess` (`permissions.ts:95-96`; catalog in `017:152-153`).
- **Admin (system_admin) retains `custodies:return`** — granted `017:187` and never revoked in `018/019/023/032`. The return/receive endpoints guard `custodies:return` (`custodies.routes.ts:24-35`), so **system_admin passes the custody write gate**; the custody service lets a GLOBAL-scope user perform an immediate return with condition (`src/modules/custodies/custodies.service.ts:13-14, 139-157`).
- Bilateral two-step mechanism **does** exist for supervisor → WM: `custodies:return` granted to `supervisor` (`032_supervisor_request_routing_and_custody.sql:49-51`); `return_pending` status (`032:33`); supervisor requests return, WM confirms via `receiveReturn` (`custodies.service.ts:216-289`). WM was re-granted `custodies:return` in the project workflow (`023_project_management_workflow.sql:37`).
- **Gap:** D3 says "Admin has NO create/return/assess" and routes "must guard against admin write access" — the actual grant matrix contradicts this (admin still holds the write permission; there is no admin-blocking guard).
- Test coverage exists for the two-step path: `tests/custodies/custody-return.test.ts`, `tests/custodies/custody-return-conditions.test.ts`, `tests/material-requests/wm-routing-and-custody.test.ts`.

### D4 — Issue Requests Never Reach Admin — ⛔ Contradicted (Critical)

- "Issue requests" in the code = the `material_requests` module. `system_admin` holds **all** request permissions: `requests:view/create/approve/reject/issue/cancel` (`017:182`) plus `requests:forward` (`019:96`).
- Service enforces admin as the **central** approver/rejecter/issuer: forwarded approval via `assertAdmin` (`material-requests.service.ts:472-478`), rejection is admin-only (`:506-526`, `requests:reject` granted only to system_admin after `018:41-44`), issue via `assertAdmin` (`:557-558`).
- **Only supervisor-originated** requests bypass admin: WM approves them to `wm_approved` (`:456-463`) and issues them (`:546-556`); grant added by `032:19-28`.
- Aligned fragments: supervisor creates/cancels own requests (`030_supervisor_request_creation.sql:40-43`; `032:51`; own-cancel enforcement `material-requests.service.ts:739-754`); no dedicated global "Approvals" nav item in the sidebar (`Sidebar.tsx:34-54`).
- **Gap:** D4 requires admin to have *zero* issue-request access; actual admin is the workflow hub for every non-supervisor request; additionally WM has no `requests:reject`, so **no one but system_admin can reject** supervisor requests either (contradicts D13).

### D5 — Purchase Request Flow (3-Stage Gate) — ❌ Missing (Critical)

- **No `purchase_requests` table, migration, module, route, or status exists** in `001–036`. Procurement is `purchase_orders` only (`033_purchase_orders.sql:58-84`).
- Purchase order approval is a single internal step done by `system_admin` **or** `warehouse_manager` (`033:225-241`, `purchase-orders.routes.ts:41-45`). There is **no Department-Manager gate** and **no 3-stage chain** Sub-WH → DM → Admin.
- The three-stage gate that *does* exist lives on **material requests**: `pending → dept_approved → forwarded → admin_approved` (`019:128-136`; service state machine `material-requests.service.ts:16-29`).
- Test evidence: PO tests exist (`tests/purchase-orders/*`), but no purchase-request tests (entity absent).

### D6 — Suppliers Are External — ⛔ Contradicted (Critical)

- `suppliers` table exists with full contact data — `name_ar, name_en, phone, email, address` (`001_initial_schema.sql:170-180`) + index (`001:182`).
- `purchase_orders.supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL` (`033:61`) — exactly the FK the agreement forbids.
- Suppliers are first-class: WM/system_admin get `suppliers:create/update` (`017:193`), frontend page (`App.tsx:14,98`, `Sidebar.tsx:38`), API (`tests/suppliers/suppliers.test.ts`).

### D7 — PO is Internal Record — 🟡 Partial (Major)

- Implemented: `purchase_orders` is an internal record; `purchase_order_status` enum = `draft, approved, partially_received, received, closed, cancelled` (`033:35-42`) — **no "sent" state, no supplier-facing workflow, no portal** (header comment `033:20-26`).
- **Gap:** D7 says "Admin creates and approves internally"; actual creation/approval/cancel/receive/transfer are granted to **both** `system_admin` and `warehouse_manager` (`033:225-241`), and `supplier_id` FK still links to the external supplier master (D6).

### D8 — "Receive" Action Auto-Transfers — 🟡 Partial (Major)

- Implemented structural parts of two-party receipt:
  - Confirmation endpoints exist: `POST /:id/receive` (RV), `POST /:id/confirm-receive` (physical receipt), `POST /allocations/:id/transfer` (TRF), `POST /allocations/:id/confirm-transfer` (`purchase-orders.routes.ts:61-110`).
  - Confirmation tracking columns: `receive_confirmed_by/at`, `transfer_confirmed_by/at`, `pending_transaction_id` (`035_po_confirmation.sql:7-20`).
- **Gap:** the agreement's receive-on-purchase-request trigger does not exist because purchase requests do not exist (D5). And in the PO flow, receive is **not** auto-transfer: receive targets the PO **MAIN** warehouse (enforced by trigger `033:90-104`), and the transfer to a sub-warehouse is a separate explicit `allocate → transfer → confirm-transfer` sequence (`033` models, `purchase-orders.routes.ts:76-110`).

### D9 — Two-Party Confirmation Principle — 🟡 Partial (Major)

- Implemented: confirmation **columns** and **endpoints** for both receipt and transfer (`035`, `purchase-orders.routes.ts:69-73,106-110`).
- **Gaps:**
  - `pending_confirmation` **does not exist anywhere** — grep of migrations + `src` returns 0 matches. `allocation_status = allocated, partially_transferred, transferred, cancelled` (`033:45-50`); `transaction_status = draft, approved` (`001:74`); `purchase_order_status` (D7).
  - The same permission (`purchase-orders:receive` / `purchase-orders:transfer`) is granted equally to both parties (`033:225-241`), and `confirmReceive`/`confirmTransfer` do **not** verify the confirmer is a *different, authorized* party — only that the status is `received`/`transferred` (`purchase-orders.service.ts:705-761`). "Two parties" is procedural, not enforced.
  - `pending_transaction_id` (`035:14`) tracks awaiting-confirmation only on PO allocations (never used by a `pending_confirmation` status; no service state machine consumes it as a state).

### D10 — Cycle Counting by Admin Only — 🟡 Partial (Major)

- Implemented: after `018`, `inventory:session:open/view`, `inventory:count:record`, `inventory:session:close` are revoked from **every** non-admin role (`018_admin_only_inventory_workflow.sql:29-44`). Routes guard each step individually (`inventory.routes.ts:9-18`) → "Admin opens, counts, closes" is exactly as agreed.
- **Gap:** "Sub-WH Manager may record counts" is **not implemented** — `inventory:count:record` is admin-only; there is no admin-opens/WM-counts delegation (no partial grant, no per-session collaborator).
- Test: `tests/authorization/inventory-workflow.test.ts`.

### D11 — Dept Manager Scope — 🟡 Partial (Major)

- Implemented: `DEPARTMENT` scope is first-class (`scope.ts:16-17,108-123`). Scoping applied across modules:
  - Items/stock → `warehouseAccessClause` (`src/modules/items/items.repository.ts:64`, `src/modules/items/items.service.ts:161-198`).
  - Vouchers (transactions) → department filter `department_id = $n OR warehouse_id IN (dept warehouses) OR to_warehouse_id IN (…)` (`transactions.service.ts:62-70`).
  - Requests → department/warehouse scope + self-approval ban (`material-requests.service.ts:383-389,446-454`).
  - Custodies → DEPARTMENT scope via project/assigned-user (`custodies.service.ts:16-28`).
  - Projects → department scope (`projects.repository.ts:99-102`).
  - DM write revocations: `requests:create` (`022`), `projects:create/update/close` + `custodies:return` (`019:79-89`), `settings:view`, `users:view` (`019:85-86`).
- **Gaps (all contradict the exact D11 text):**
  - *"purchase requests (view)"* → N/A, module absent (D5); DM has **no PO permissions** at all (`033:224` explicitly).
  - *"movements"* → DM lacks `stock-movements:view-all` (`017` DM block `:252-267`; page guarded by it `App.tsx:117`), so DM cannot see the Stock Movements page.
  - *"cannot see main warehouse"* → DM's `warehouseAccessClause` includes all warehouses whose `department_id = DM's` department — including that department's **MAIN** warehouse (`scope.ts:108-123`; `warehouses.department_id` set in `019:105-108`). DM sees its own department's main warehouse, which the agreement explicitly excludes.
- Test: `tests/authorization/scope-regressions.test.ts`, `tests/material-requests/self-approval.test.ts`.

### D12 — Supervisor Scope — 🟡 Partial (Major)

- Implemented:
  - No dedicated items page for supervisor (no `items:view` grant in `030`; `/items` guarded by `items:view`, `App.tsx:104`).
  - Request-time item scope: supervisor department derived from the authenticated user; destination warehouse must be dept-owned eligible (`material-requests.service.ts:74-99`); every line item must be active and belong to a dept warehouse (`:252-279`); project attachment only for own supervised project (`:209-219`).
  - Cancel own request (`030`/`032` grants + own-only enforcement `:739-754`); no edit-after-submit (no PATCH body route exists; state machine has no edit transition); own request status via `requests:view_own` (`018:23`, `030:42`) incl. own-custody visibility (`custodies.service.ts:30-34`).
  - Grants as of `030`+`031`+`032`: `requests:create/view/view_own/cancel`, `projects:view/create/update/delete`, `custodies:view/return` — least privilege confirmed by migration comments.
- **Gaps:**
  - *"Only current on-hand balance > 0"* is **not enforced** — `getRequestCatalog` returns items without any `balance > 0` predicate (`material-requests.service.ts:345-360`); the frontend filters only by status/main/department, not balance (`CreateMaterialRequestPage.tsx:85-102`).
  - `/my-custody` (own-custody page) is guarded by `custodies:view_own`, a permission that **exists only in the frontend** (`App.tsx:127`, `Sidebar.tsx:49`, `WMS_Frontend/src/types/index.ts:32`, `HANDOVER_REPORT.md:335`) and **not in the backend catalog** (`permissions.ts`) or any migration → the route is unreachable for every role.

### D13 — Issue Request Approval — 🟡 Partial (Major)

- Implemented for supervisor-originated requests: WM approves directly → `wm_approved` and issues (`032:19-28` granting `requests:approve`+`requests:issue`; `material-requests.service.ts:456-463,546-556`), bypassing DM and Admin — matching "approved by Sub-WH Manager of the supervisor's department, no DM, no Admin".
- Scoping: WM must be in scope of the request warehouse (`inScope` `:437-441`), which is the supervisor's department warehouse.
- **Gap:** the Sub-WH **cannot reject** supervisor requests — `requests:reject` is admin-only (`018:41-44` revoked it from every non-admin; `032` re-added only approve+issue). `rejectRequest` also hard-requires `assertAdmin` for forwarded requests (`material-requests.service.ts:519`) and only permits reject from `forwarded|pending` (`:516-518`).
- Test: `tests/material-requests/supervisor-request.test.ts`, `tests/material-requests/wm-routing-and-custody.test.ts`.

### D14 — Purchase Request Rejection Path — ❌ Missing (Major)

- Purchase requests do not exist (D5) → **no** Sub-WH reject, **no** Admin reject, **no** `rejected` return path, **no** rejection-reason view on any procurement record.
- Analogue (issue-request side, not purchase): `admin_rejected` status (`019:134`), `rejected_by`/`rejection_reason` columns (`019:148`), reject only from `forwarded|pending` by admin (`material-requests.service.ts:506-526`). **There is no department-manager rejection state** for material requests either (DM only approves/forwards).
- The DM-reject branch of D14 is thus unimplemented in both flows.

### D15 — Custody Condition Assessment — 🟡 Partial (Major)

- Implemented: `custody_condition` enum `good|damaged|lost` (`023:87-90`), `custodies.condition` default `good` (`023:94`), damaged/lost custody statuses (`023:96-97`), return-time condition capture + non-restoration (`custodies.service.ts:108-111,159-167,239-247`).
- WM performs returns/confirmation (`023:37` re-grants `custodies:return`) — matches "performed by Sub-WH Manager only" for the WM side.
- **Gaps:**
  - system_admin also holds `custodies:return` (`017:187`) and the GLOBAL return path can set condition (`custodies.service.ts:13-14`) → "Admin has no role" is false.
  - Supervisor-initiated two-step returns persist `condition` as `good` at request time; the confirmed condition is read back from the custody (`receiveReturn` uses `custody.condition`, `:237,240-241`) — the WM has no way to adjust damaged/lost during the confirmation step.
- Test: `tests/custodies/custody-return-conditions.test.ts`.

### D16 — Project Closure Blocked by Active Custody — 🟡 Partial (Major)

- Implemented: close is blocked when active custodies exist — `projects.service.ts:346-350` calls `countActiveCustodiesByProject` (`custodies.repository.ts:248-256`); report `can_close` likewise (`projects.repository.ts:297-364`). `pending_closure` NP1 workflow exists (`036_project_pending_closure.sql:8-13`; `projects.routes.ts:46-56`).
- **Gap:** `countActiveCustodiesByProject` filters `status = 'active'` **only** (`custodies.repository.ts:250-252`) — a custody already in `return_pending` (D3 flow, `032:33`) is ignored, so a `return_pending` project **can be closed** in the current code, violating the explicit agree text.
- Test: `tests/projects/projects-close.test.ts`, `tests/projects/supervisor-project.test.ts` (do not cover the return_pending case).

## 3. Contradictions Summary

| # | Severity | Decision | Contradiction |
|---|---|---|---|
| C1 | Critical | D1/D2 | Roles `admin`/`sub_warehouse_manager` don't exist; `system_admin`+`warehouse_manager` are separate, active, and pass the login gate (`users.repository.ts:15-20`, `001:54-57`, `017:176-208`) |
| C2 | Critical | D3 | Admin retains `custodies:return` (`017:187`); custody write routes only guard `custodies:return` (`custodies.routes.ts:24-35`), so admin can return/assess |
| C3 | Critical | D4 | Admin is the central approver/rejecter/issuer of issue requests (`017:182`, `material-requests.service.ts:472-478,506-526,557-558`) |
| C4 | Critical | D6 | `suppliers` table + `phone/email/address` (`001:170-180`), `purchase_orders.supplier_id` FK (`033:61`), suppliers UI/pages/tests |
| C5 | Major | D11 | DM scope includes the department's **main** warehouse (`scope.ts:108-123`); DM has no movements (`stock-movements:view-all`) and no purchase-request view (D5) |
| C6 | Major | D13 | Only system_admin has `requests:reject` (`018:41-44`) — Sub-WH cannot reject supervisor requests |
| C7 | Major | D16 | Closure block checks `status='active'` only (`custodies.repository.ts:250-252`), not `return_pending` |
| C8 | Minor | D10/D12/D15 | granular gaps: no WM count-recording, no `balance>0` filter, admin still in custody return path |

## 4. Missing Implementations

- **M1 — Purchase-request module** (D5/D14): no `purchase_requests` table, statuses (`pending/rejected/…`), routes, service, or department gate. Nothing to build from — greenfield.
- **M2 — Sub-WH rejection capability** (D4/D13/D14): `requests:reject` is admin-only; supervisor-request rejection is impossible for WM.
- **M3 — Purchase-request rejection path + rejection reason UI** (D14) — absent by transitive dependency on M1.
- **M4 — `pending_confirmation` transfer state** (D9): not present in `allocation_status`, `transaction_status`, or `purchase_order_status`.
- **M5 — Distinct-party confirmation enforcement** (D9): `confirmReceive`/`confirmTransfer` never verify the confirmer differs from the movement creator.
- **M6 — `return_pending` in project-close guard** (D16).
- **M7 — Admin write-blocking on custody routes** (D3): no guard, branch, or grant-revocation for system_admin.
- **M8 — `custodies:view_own` permission** (D12): referenced by the frontend but absent from the backend catalog → `/my-custody` unreachable.
- **M9 — `balance > 0` filter in supervisor request catalog** (D12).
- **M10 — Count-recording delegation for WM during admin-opened sessions** (D10).

## 5. Partial Implementations

- **P1 — PO internal record** (D7): correct shape and no `sent` state, but `warehouse_manager` shares all `purchase-orders:*` grants (`033:225-241`).
- **P2 — Two-party PO receipt/transfer** (D8/D9): endpoints + tracking columns exist (`035`, routes), but no auto-TRF on receive and no party separation.
- **P3 — Admin-only cycle counting** (D10): the "admin only" half is exact (`018:29-44`); the delegation half is missing (→ M10).
- **P4 — DEPARTMENT scope** (D11): broadly applied across modules, with the D11 nuance gaps above.
- **P5 — Supervisor module** (D12/D13): request-time scoping, own-cancel, own-tracked custodies implemented via `030/031/032`; missing on-hand filter and backend `custodies:view_own`.
- **P6 — Custody condition/lifecycle** (D15): enum/columns/return-flow present; admin unwarranted participation and WM condition-edit gap remain.
- **P7 — Project close guard** (D16): active-custody blocking present; `return_pending` not included (→ M6).

## 6. Test Coverage Gaps

| Gap | Decision | Note |
|---|---|---|
| No tests for purchase-requests (entity absent) | D5/D14 | M1 |
| No test that admin is blocked from custody writes (would fail today) | D3/D15 | C2 |
| No test that WM rejects a supervisor request (would fail today) | D13/D14 | C6 |
| No test that `return_pending` blocks project close (would fail today) | D16 | C7 |
| No test asserting `balance>0` in supervisor request catalog | D12 | M9 |
| No test for distinct-party confirmation | D9 | M5 |

Existing relevant suites (reference for future work): `tests/auth/*`, `tests/users/users-admin-crud.test.ts`, `tests/authorization/authorization.test.ts`, `tests/authorization/inventory-workflow.test.ts`, `tests/authorization/scope-regressions.test.ts`, `tests/material-requests/*` (incl. `supervisor-request`, `wm-routing-and-custody`, `self-approval`), `tests/custodies/*` (incl. `custody-return-conditions`, `custody-return`), `tests/projects/*` (incl. `projects-close`, `supervisor-project`, `project-system-dates`), `tests/purchase-orders/*` (incl. `permissions`, `scope-security`, `status`, `integration-e2e`), `tests/suppliers/suppliers.test.ts`, `tests/supervisors/supervisors.test.ts`.

## 7. Permission Matrix — Actual vs Agreed

Legend: Y = granted, G = guarded, D = denied, — = not in catalog. Actual = working tree + migrations 001–036 applied.

**Issue Requests (`requests:*`) — Actual (effective):**

| Permission | Admin (sys_admin) | Sub-WH (wh_mgr) | Dept Mgr | Supervisor |
|---|---|---|---|---|
| `requests:view` | Y `017:182` | Y `017:203` | Y `017:263` | Y `030:41` |
| `requests:view_own` | Y `018:23` | Y `018:50` | Y `018:53` | Y `030:42` |
| `requests:create` | Y `017:182` | Y `017:203` | D `022` | Y `030:40` |
| `requests:approve` | Y `017:182` | Y `032:24` | Y `019:94` | D |
| `requests:forward` | Y `019:96` | D | Y `019:95` | D |
| `requests:reject` | Y `017:182` | D `018:42` | D | D |
| `requests:issue` | Y `017:182` | Y `032:24` | D | D |
| `requests:cancel` | Y `017:182` | Y `017:203` | Y `017:263` | Y `032:51` |

**Issue Requests — Agreed (D4/D13):** admin = all `D`; Sub-WH = approve/reject/issue `Y`, else `D`; Dept Mgr = `D` (not in this flow); Supervisor = create/cancel own only.
**△ Admin column: agrees to `D` everywhere — actual has `Y` on 7 of 8.** ✗

**Custodies — Actual (effective):**

| Permission | Admin | Sub-WH | Dept Mgr | Supervisor |
|---|---|---|---|---|
| `custodies:view` | Y `017:187` | Y `017:208` | Y `017:267` | Y `032:51` |
| `custodies:return` | Y `017:187` | Y `023:37` | D `019:88` | Y `032:51` |
| `custodies:create` | — | — | — | — |
| `custodies:assess` | — | — | — | — |

**Custodies — Agreed (D3/D15):** admin = view only (no create/return/assess); Sub-WH = return/assess; Dept Mgr = view only; Supervisor = holder (return request).
**△ Admin `custodies:return` = `Y` contradicts "NO return/assess".** ✗

**Purchase Orders — Actual (effective):** `purchase-orders:view/create/update/approve/cancel/receive/allocate/transfer` — Y for **both** Admin (`033:226-233`) and Sub-WH (`033:234-241`); D for Dept Mgr and Supervisor (`033:224`).
**Agreed (D5/D7/D8/D9):** Admin = create/approve/receive-confirm; Sub-WH = transfer-confirm; Dept Mgr = purchase-request gate (n/a); Supervisor = none.
**△ Sub-WH has full PO control (contradicts D7 "Admin creates/approves").** ✗

**Inventory — Actual (effective):** `inventory:session:open/view`, `inventory:count:record`, `inventory:session:close` = Y for Admin only (`018:29-44`); all others D.
**Agreed (D10):** Admin open/count/close; Sub-WH may record counts.
**△ Sub-WH count-recording missing.** ✗

**Projects — Actual (effective):** view Y (all four); create/update — Admin Y, Sub-WH Y (`023:34-35`), Dept Mgr D (`019:87`), Supervisor Y (`031:31-33`); close — Admin Y, Sub-WH Y (`023:36`), Dept Mgr D, Supervisor D; delete — Admin Y, Supervisor Y (`031:33`).
**Agreed (D16/D11/D12):** Admin closes; Supervisor manages own projects; Dept Mgr view-only.
**△ Mostly consistent; Dept Mgr view-only ✓, Supervisor no close ✓.** ✓-ish

## 8. Status Enum Comparison (per workflow)

| Workflow | Agreed model | Actual (code) |
|---|---|---|
| Roles | 4: admin, sub_warehouse_manager, department_manager, supervisor | 7: system_admin, warehouse_manager, storekeeper, accountant, department_manager, viewer, supervisor (`001:54-57`, `027:26`) |
| Issue requests | created → Sub-WH approved → issued; rejected (by Sub-WH); cancelled | pending → dept_approved → forwarded → admin_approved → issued; wm_approved (supervisor route, `032:14`); admin_rejected; cancelled (`019:128-136`, `032:14`) |
| Purchase requests | pending → DM approved → Admin approved → rejected | **does not exist** (D5) |
| PO | draft → approved → received → closed (no sent) | draft, approved, partially_received, received, closed, cancelled (`033:35-42`) — no sent ✓ |
| Transfer/allocation | pending_confirmation required (D9) | allocated, partially_transferred, transferred, cancelled (`033:45-50`) — **no pending_confirmation** |
| Custody | active → returned; return_pending; damaged/lost | active, returned (`001:137`); damaged, lost (`023:96-97`); return_pending (`032:33`) |
| Project | open → closed; blocked by active/return_pending | open, closed (`001:123`); cancelled (`023:70`); pending_closure (`036:8`) |
| Transaction | — | draft, approved (`001:74`) |

## 9. Critical Findings

1. **Role identity is the opposite of the agreement** (C1): the roles the agreement wanted to retire (`system_admin`, `warehouse_manager`) are the two active system-wide roles; the roles the agreement wanted (`admin`, `sub_warehouse_manager`) do not exist anywhere. Any "activate/deactivate" fix touches `ACTIVE_ROLES` + enum + `role_permissions` + login gate together.
2. **Admin is the hub of both flows the agreement isolates** (C2/C3): system_admin can create/approve/reject/issue requests and can return/assess custodies. D3/D4 require admin to have zero custody-write and zero issue-request access.
3. **Suppliers contradict D6 at every layer** (C4): schema-FK, permissions, UI page, API tests.
4. **Procurement is PO-only with no Department gate** (M1): D5/D14 (purchase-request flow + rejection) require a brand-new module; the PO itself follows a two-party supply model (D8/D9) with confirmation columns but no `pending_confirmation` state and no party-distinction check.
5. **Project-close guard misses `return_pending`** (C7): a custody already mid-return does not block closure today.
6. **Frontend/backend permission mismatch**: `custodies:view_own` is used by the UI (`App.tsx:127`, `Sidebar.tsx:49`) but absent from the backend catalog — the "My Custody" page is unreachable for all roles.
7. **Unrelated pre-existing build noise**: 4 typecheck errors exist from `AuditAction` literals (`projects.controller.ts:118` `PROJECT_CLOSURE_INITIATED`; `purchase-orders.controller.ts:229/249/269`) — not part of this audit, but they block a clean `tsc` gate.

## 10. Recommended Remediation Plan

- **P0 (immediate, safety):** fix `/my-custody` (M8) and the 4 `AuditAction` literal errors so `tsc` is green.
- **P1 (D1/D2, Critical):** Migration 037 — introduce `admin`/`sub_warehouse_manager` roles (or rename `system_admin`→`admin`, `warehouse_manager`→`sub_warehouse_manager`) in enum + `roles`; migrate `role_permissions` via code mapping; set `ACTIVE_ROLES` to the four agreed codes; keep `reject-at-login` logic (`auth.controller.ts:33,109`) unchanged so legacy values are refused; update `scope.ts` (GLOBAL→admin, WAREHOUSE→sub_wh) and any role-checks in services (`assertAdmin`, `isWarehouseFallbackUser`).
- **P2 (D3/D4/D15, Critical):** revoke `custodies:return` + `requests:approve/reject/issue/forward` from system_admin (grant-matrix migration), or gate by request-origin in `material-requests.service.ts`; add an explicit admin-block guard on `custodies.routes.ts:24-35`.
- **P3 (D6, Critical — scope decision):** either drop `suppliers` (free-text name on PO, remove FK `033:61`, archive module+pages+tests) **or** formally reopen the decision to keep the supplier master. No middle ground satisfies D6.
- **P4 (D5/D14, Critical):** build `purchase_requests` (Sub-WH create → DM approve/reject → Admin approve/reject; statuses `pending/approved/rejected`; `rejected_by`/`rejection_reason`) with routes + UI, or explicitly replace D5/D14 with "PO + department gate" and update the agreement.
- **P5 (D9, Major):** add `pending_confirmation` to `allocation_status` (and/or PO/transaction statuses); enforce distinct-party confirmation in `confirmReceive`/`confirmTransfer`.
- **P6 (D16, Major):** extend `countActiveCustodiesByProject` to `status IN ('active','return_pending')` (`custodies.repository.ts:248-256`) and the close-report `can_close` computation (`projects.repository.ts:297-364`).
- **P7 (D13/D14):** grant `warehouse_manager` `requests:reject` scoped to `wm_approved`-routed requests and add a WM reject endpoint/status.
- **P8 (D10):** add an admin-opened-session counter role (`inventory:count:record` for WM within sessions opened by admin; service-layer check).
- **P9 (D12):** add `current_balance > 0` to `getRequestCatalog` (`material-requests.service.ts:345-360`) and mirror in the frontend item picker.
- **P10 (tests):** add failing-then-passing tests for C2/C6/C7, M1 route matrix, M5 party-distinction, M9 filter, and `custodies:view_own`.

## 11. Audit Confidence

- **High** — every claim is backed by a file/migration/line citation; DB state was confirmed by running all 23 migrations (001–036) and inspecting seeded data in this session.
- **Limitations:** ① D8/D9/D10 dependence on runtime behavior inferred from service code + tests (no live API replay of `confirm-*` runs); ② frontend role gating verified at route/nav level, not via browser walkthrough; ③ the agreed D1–D16 text was supplied conversationally (recorded verbatim in the decision-by-decision section), so verdict labels assume that text is authoritative.
- **Repeatability:** re-run with `npm run migrate` + `npm run seed:test` (backend at `WMS_Managment_Backend`, DB `DTC_WMS_final_db`).