---
author: opencode (big-pickle)
date-generated: "2026-09-12"
model-id: opencode/big-pickle
phase: 6
verdict: ISSUES FOUND
highest-severity: HIGH — department-assigned sub_warehouse_manager locked out of Purchase Orders (poScopeClause/assertPoInScope return FALSE/404 for DEPARTMENT scope)
---

# Phase 6 Report — Final System Verification

## 1. Executive Summary

This is the final, whole-system verification pass over the WMS after Phase 5.
All twelve verification parts were executed against both live databases
(`DTC_WMS_final_db` main, `dtc_wms_test` test) and against the source tree.

**Headline result: ISSUES FOUND.**

- **FINDING-1 (HIGH, functional):** a `sub_warehouse_manager` who has a
  `department_id` — which is the **mandatory production configuration** per the
  seeded business rules — resolves to `DEPARTMENT` data scope and is therefore
  **completely locked out of Purchase Orders**: the list clause renders `FALSE`
  and every single-PO op `assertPoInScope` throws `404`. This makes the Phase 5
  D8/D9 auto-transfer lifecycle unreachable by its intended actor (the
  department sub-warehouse manager); only an admin (or the non-production,
  department-less sub-WM shape used in tests) can operate POs. Pre-existing
  since the PO scope clause was first written; surfaced by this verification.
- **FINDING-2 (LOW, documentation):** `PHASE5_REPORT.md` §9 states that
  permission codes `purchase-orders:allocate` (75) and
  `purchase-orders:transfer` (76) "remain in the DB permission catalog". They
  do not — both were **deleted** by migration 046 and are absent from the live
  catalog. The Phase 5 report needs a factual correction.
- **FINDING-3 (LOW, cosmetic):** two stale code comments still reference the
  removed "allocations" model (`purchase-orders.routes.ts:26`,
  `transactions.repository.ts:13`).

Everything else verifies clean: migrations applied identically on both
databases (33/33, checksums match, zero drift), schema fully matches the
final-state model, RBAC matrix is coherent, all 12 data-integrity checks return
0 orphans on both databases, the security audit passes (parameterized SQL only,
helmet, CORS, rate limits, bcrypt + `token_version` session revocation), both
test suites are green (backend 62 suites / 598 tests; frontend 8 / 62), both
`tsc --noEmit` runs are clean, `vite build` and a live API smoke test succeed,
and all 13 phase/analysis documents are present.

## 2. Verification Scope & Method

- Sources: `WMS_Managment_Backend` + `WMS_Frontend` (git tree), PostgreSQL 16
  via `C:\Program Files\PostgreSQL\16\bin\psql.exe`.
- Live DBs: main `postgresql://postgres:123456@localhost:5432/DTC_WMS_final_db?sslmode=disable`,
  test `postgresql://postgres:123456@localhost:5432/dtc_wms_test?sslmode=disable`.
- Migration runner: `npm run migrate -- --verify` (ts-node, run twice — once per DB target).
- Verification-only phase: **no code, schema, or data modifications were made**;
  findings are reported for remediation, not applied.

## 3. Database & Migrations — PASS

| Check | Main DB | Test DB |
|---|---|---|
| `_migrations` applied | 33 | 33 |
| Pending | 0 | 0 |
| Checksum `_migrations` identical between DBs | yes (byte-identical) | yes |
| Migration files 001–046 (002–014 archived under `migrations/archive`) | present | present |

`_migration_notes` (all keys present, both DBs): `roles_snapshot`,
`role_permissions_snapshot`, `role_rename` (5 renames), `phase2_permissions`,
`phase3_supplier_backfill`, `phase3_drop_suppliers`, `phase4_purchase_requests_created`,
`phase4_purchase_requests_permissions`, `phase5_auto_transfer_columns`,
`phase5_drop_allocations`.

**Result: the two databases have zero schema drift.**

## 4. Schema Verification — PASS (one note)

All queries run against BOTH databases:

| Check | Expected final state (per plan) | Actual | Verdict |
|---|---|---|---|
| `suppliers` table | removed | 0 rows / table absent | ✅ |
| `purchase_orders.supplier_id` | removed | 0 columns | ✅ |
| `suppliers:*` permission codes | removed | 0 | ✅ |
| `purchase_orders.supplier_name` | NOT NULL free-text | NOT NULL | ✅ |
| `allocations` table | removed | absent | ✅ |
| `allocation_status` / `purchase_order_allocations` enum | removed | absent | ✅ |
| `purchase_requests` / `purchase_request_items` | present | 2 tables | ✅ |
| PR status enum | 5-state chain | `pending,dept_approved,admin_approved,rejected,cancelled` | ✅ |
| PO auto-transfer columns (D8) | present | 4 (`auto_transfer_created`,`linked_transfer_id`,`linked_transfer_no`,`linked_transfer_destination_warehouse_id`) | ✅ |
| `user_role` enum | 7 legacy values | **4 values** (`admin, sub_warehouse_manager, department_manager, supervisor`) | ⚠️ see note |
| `roles` table | 4 active | 4 (`admin,department_manager,sub_warehouse_manager,supervisor`) | ✅ |
| `users` legacy-role contamination | none | proof: querying `storekeeper` as a role value raises `invalid input value for enum user_role` | ✅ |

**Note (positive deviation):** the plan's "expected" enum of 7 values
(including legacy `storekeeper`/`accountant`/`viewer`) reflected the legacy
snapshot. The system has fully dropped the three legacy values — the enum is
*more* complete than the expected table. The `users` column
`role` → `user_role` cast is now total (every stored value is a valid current
role). Recorded as PASS with an explanatory note, not a defect.

## 5. RBAC Matrix — PASS (design deviations documented)

Full matrix dumped for `admin`, `department_manager`, `sub_warehouse_manager`,
`supervisor` (85 catalog rows, IDs 1–85, gaps at 10–13 (removed `suppliers:*`)
and 75–76 (removed PO allocate/transfer — see FINDING-2)).

| Claim | Status | Evidence |
|---|---|---|
| `admin` = full access minus `requests:*` / write on custodies | ✅ | migration 039 revokes `requests:*` and `custodies:write` from admin |
| `department_manager` intermediate procurement approval layer | ✅ | holds `requests:approve|cancel|forward`, own-department only; see W1 |
| `department_manager` = view-only (task wording) | ⚠️ **deviation, by design** | dept manager executes the dept approval step of the PR/auto-PO chain — verified in `material-requests.service.ts:442–469` + `purchase-requests` flow; therefore NOT view-only |
| `sub_warehouse_manager` inventory = count only | ✅ **by design** | holds **zero** `inventory:*` perms (all 4 codes admin-only). D10 fallback in `inventory.service.ts:102–133` lets a sub-WM record counts only into **assigned** warehouses; session open/close/view remain admin. Matches task expectation |
| `sub_warehouse_manager` PO permissions present | ✅ | holds `purchase-orders:view|create|receive` — but see FINDING-1 (scope makes them unusable) |
| `supervisor` scoping | ✅ | project-scoped requests only; no PO/items visibility |

## 6. Workflows W1–W5 — PASS (traced, file-cited)

- **W1 Purchase-request → auto purchase order.**
  `storekeeper/sub_warehouse_manager` creates PR
  (`purchase-requests` routes/service) → `department_manager` approves
  (`approve-dept`, SELF approval blocked, `material-requests.service.ts:463`
  analog) → `admin` approves (`approve-admin`) which **atomically creates the
  linked PO** (`purchase_requests.purchase_order_id` back-link). Covered by
  `tests/purchase-requests/auto-po.test.ts`,
  `tests/rbac/phase-2-behavior.test.ts:475–494`.
- **W2 Receive → auto-transfer → confirm (D8/D9).**
  `POST /purchase-orders/:id/receive` (`purchase-orders.service.ts:560`) writes
  the RV **and**, inside the same transaction, drafts a TRF to the PR creator's
  unique non-main sub-warehouse (destination derivation; 0 → 
  `NO_TRANSFER_DESTINATION`, >1 → `AMBIGUOUS_TRANSFER_DESTINATION`, both roll
  back). `POST /:id/confirm-transfer` (`:628–635`) approves all pending draft
  TRFs; self-confirm → 403; PO close blocked while draft TRF pending. Covered by
  `tests/purchase-orders/auto-transfer.test.ts` (T1/T2), `phase-2-behavior.test.ts:464–534`.
- **W3 Material-request approvals & custody return.**
  Supervisor creates (project-scoped) or sub-WM routes → dept manager approves /
  forwards (`material-requests.service.ts:62–79, 219, 257, 463–474`) → issue
  against warehouse stock (`issue-flow-e2e.test.ts`) → custody return with
  quantity/condition tracking (`tests/custodies/custody-return*.test.ts`).
- **W4 Inventory count.** Admin opens session (`inventory:session:open`),
  sub-WM records counts into assigned warehouses (D10,
  `inventory.service.ts:101–133`), admin closes (variances + journal). Scope
  coverage in `tests/inventory/inventory-count-scope.test.ts`.
- **W5 Auth & session lifecycle.** Login issues JWT+hashed refresh token
  (`auth.controller.ts:60,136`), `token_version` mismatch invalidates JWTs
  (`auth.middleware.ts:53–54`), logout/refresh revoke the hashed refresh token
  (`auth.controller.ts:129,170`), deactivation bumps `token_version`
  (`users.service.ts:152`). Covered by `tests/auth/*`.

## 7. Two-Party Confirmation Audit — PASS

| Operation | Rule | Source evidence |
|---|---|---|
| PO receive / confirm-receive | receiver ≠ confirmer; `receive_confirmed_by` recorded | `purchase-orders.service.ts:558–565`; `phase-2-behavior.test.ts:455–461` |
| Auto-transfer confirm (D9) | TRF drafter ≠ confirmer (403 when equal) | `purchase-orders.service.ts:628–635`; `auto-transfer.test.ts:117–128` |
| Inventory close | session open/close by admin (different from sub-WM recorders) | perm catalog (admin-only) + `inventory.service.ts` |

No single-op self-confirmation holes found.

## 8. Data Scope Enforcement Audit — FINDING-1 (HIGH)**

Scope map (`authorization/scope.ts:16–24`): admin→GLOBAL, dept_manager→DEPARTMENT,
sub_WM with `department_id`→**DEPARTMENT**, sub_WM without dept→WAREHOUSE, else NONE.

| Module | GLOBAL | WAREHOUSE | DEPARTMENT | Verdict |
|---|---|---|---|---|
| Material requests | ✅ | ✅ | ✅ own dept | ✅ |
| Purchase requests | ✅ | `view:own` | ✅ own dept | ✅ |
| Transactions | ✅ | ✅ | ✅ own dept (main+subs) — documented at `transactions.service.ts:80–82`, sibling depts never visible | ✅ as designed |
| Custodies | ✅ | ✅ | ✅ own dept | ✅ |
| Inventory counts | ✅ | ✅ assigned wh | n/a (admin) | ✅ |
| Batches / stock movements / alerts | ✅ | ✅ | ✅ own dept | ✅ |
| **Purchase orders** | ✅ | ✅ | ❌ **FALSE** | ❌ **FINDING-1** |

**FINDING-1 reproduction (compiled distribution, no DB mutation):**

```
dept-assigned (production rule)  scope=DEPARTMENT  poScopeClause={"clause":"FALSE","params":[]}
dept+wh                          scope=DEPARTMENT  poScopeClause={"clause":"FALSE","params":[]}
no-dept wh-assigned              scope=WAREHOUSE   poScopeClause={"clause":"(po.warehouse_id = ANY($1))","params":[[5]]}
no-dept no-wh                    scope=NONE        poScopeClause={"clause":"FALSE","params":[]}
```

- `poScopeClause` handles only GLOBAL and WAREHOUSE; DEPARTMENT/NONE fall to
  `FALSE` (`purchase-orders.repository.ts:19–40`).
- `assertPoInScope` (`purchase-orders.service.ts:26–44`) returns for GLOBAL,
  checks WAREHOUSE, else throws `NotFoundError` (404). Its WAREHOUSE-branch
  "own department" sub-check (`:37–41`) is **unreachable** (WAREHOUSE scope
  implies `department_id == null`), confirming the missing DEPARTMENT path.
- The doc comment on `poScopeClause` (`:15–17`) *promises* "DEPARTMENT resolves
  to the department's warehouses" — the implementation never delivers it.
  (`poScopeClause` is also `FALSE` for `department_manager`, matching its lack
  of PO permissions, but the sub-WM case is real.)
- **Production impact:** the seeded business rule *mandates* a department on
  every active sub-WM (`reset-demo-environment.ts:356–357`, `repair-demo-data.ts:676`;
  demo `wh_manager` → dept PROC, `seed-demo.ts:86`; test-seed `storekeeper` → OPS,
  dept=3 live in `DTC_WMS_final_db`). Every such user gets `poScopeClause = FALSE`:
  their PO list is empty and `GET/:id`, `receive`, `confirm-receive`,
  `confirm-transfer` all 404.
- **Why the suite is green:** every PO operation in the tests runs as *admin* or
  as a **department-less** sub-WM (`purchase-orders/helpers.ts:100`, `wmMain`
  warehouse_ids only; `phase-2-behavior.test.ts:172,468`). The dept-assigned
  sub-WM only ever *creates* the PR in tests, never touches a PO. No test covers
  the production user shape against PO endpoints.
- **Pre-existing, not a Phase 5 regression:** the clause dates to the PO module's
  creation; Phase 5's D8 feature simply inherits it. It is nonetheless the
  highest-impact finding: the flagship workflow cannot be driven by its intended
  role.
- **Suggested fix direction (not applied, verification phase):** add a DEPARTMENT
  branch to `poScopeClause` and `assertPoInScope` enumerating the user's
  department-related warehouses (the doc comment's stated intent), and add a
  regression test using a dept-assigned sub-WM against `/purchase-orders/:id/receive`
  + `/confirm-transfer`.

## 9. Cleanup / Orphan-Reference Audit — PASS (3 notes)

Grepped backend `src`, backend tests, and `WMS_Frontend/src`:

| Token | Result |
|---|---|
| `supplier_id` | 0 (backend), 0 (frontend) |
| `suppliers` | only legitimate free-text-supplier comments (`purchase-orders.validator.ts:18,74`; `supplier-name.test.ts` structural guards) |
| `allocations` / `allocation` | 2 stale comments → FINDING-3 |
| `warehouse_manager` | 57 matches, all `sub_warehouse_manager` (canonical) — no orphans |

Frontend `WMS_Frontend/src` is fully clean of supplier/allocation references
(Phase 5 removed the UI/hooks/api/types/i18n).

## 10. Security Audit — PASS

- **SQL injection:** all user input is parameterized (`$1…$n`); the only string
  interpolations into query text are fixed `*_SELECT` column constants or
  `where` fragments built from whitelisted column names + positional
  placeholders (verified: `alerts.repository.ts:26–34`, `custodies.repository.ts:110–118`,
  `transactions.service.ts:76–99`, `purchase-orders.repository.ts:135–150`).
- **Headers/CORS:** `helmet()` + configured `cors` (`app.ts:36–37`).
- **Rate limiting:** global API limiter (`app.ts:43`) + dedicated
  login/refresh limiters (`auth.routes.ts:9,23`).
- **Passwords:** bcryptjs, salt rounds 10 (`utils/crypto.ts`).
- **Session revocation:** JWT validated against live `token_version`
  (`auth.middleware.ts:53–54`); refresh tokens stored as hashes and revoked on
  logout/refresh (`auth.controller.ts:129,170`); deactivation bumps
  `token_version` (`users.service.ts:152`).
- **Privilege checks:** every mutating route is gated by `authorize(<perm>)` and
  every repository applies a user-scope clause (fail-closed to FALSE).

No security defects found.

## 11. Test-Suite Verification — PASS

| Suite | Command | Result |
|---|---|---|
| Backend unit+integration (Express + live Postgres) | `npm test` | **62 suites / 598 tests, all passed** (63.7s) |
| Frontend | `npm test` (vitest) | **8 files / 62 tests, all passed** |
| Backend typecheck | `npm run typecheck` (`tsc --noEmit`) | clean |
| Frontend typecheck | `npm run typecheck` (`tsc -b --noEmit`) | clean |
| Frontend production build | `npm run build` (`tsc -b && vite build`) | built in ~3s |

Key lifecycle suites exercised: `phase-2-behavior` (D8/D9), `auto-transfer`,
`purchase-requests/auto-po`, `issue-flow-e2e`, `custody-return*`,
`authorization/*`, `inventory-count-scope`, `rbac/*`, `projects/*`,
`supervisors/*`. Note: none covers the FINDING-1 user shape (see §8).

## 12. Documentation Completeness — PASS (one correction due)

Expected deliverables (13) — all present:

```
PHASE0_REPORT, PHASE0_5_REPORT, PHASE0_75_REPORT, PHASE0_9_REPORT,
PHASE1_REPORT, PHASE1_5_REPORT, PHASE2_REPORT, PHASE3_REPORT,
PHASE3_5_REPORT, PHASE4_1_REPORT, PHASE4_2_REPORT, PHASE5_REPORT,
role_model_code_audit.md, warehouse_project_discovery.md
```

Extra present: `HANDOVER_REPORT(_EXHAUSTIVE)`, `MIGRATION-REPORT`,
`REMEDIATION`, `REQUIREMENTS_COMPLIANCE_REPORT`, `walkthrough`.

**FINDING-2:** `PHASE5_REPORT.md` §9 ("permissions remain in DB catalog")
misstates the live catalog: `purchase-orders:allocate` (75) and
`purchase-orders:transfer` (76) were deleted by migration 046 and are absent
(IDS 75–76 gap). Correction of this factual statement is recommended under the
doc-typo allowance.

## 13. E2E Smoke Test — PASS

- **Live smoke** (`node dist/server.js` against `DTC_WMS_final_db`, port 5000):
  login as `wh.manager` (sub_WM, no dept) ✅, as `storekeeper` (sub_WM, OPS
  dept) ✅, as `admin` ✅; `GET /api/purchase-orders` executed with all three
  tokens without server errors. (Main DB currently holds 0 POs, so scope
  differences on the live list are not observable in-row; the scope gap is proven
  in §8 via the compiled-clause reproduction instead.)
- **In-suite E2E:** the 598 backend tests boot the full Express app against the
  real Postgres test database and traverse every workflow including the complete
  D8/D9 auto-transfer round trip (§6, §7).

## 14. Data Integrity — PASS

12 checks per database, all **0 orphans** on BOTH DBs: PO without warehouse, PO
detail without item, PR item without PR, PR without department, negative stock,
transaction without warehouse, transaction detail without header, custody with
missing assignee, open inventory sessions, stale draft TRFs, MR without
requester, and PO→warehouse department mismatch. Also confirmed: no PO crosses
department boundaries.

Current data volumes (main / test): users 7 (active) / 19; POs 0/0; PRs 0/0;
MRs 0/8; transactions 0/16; custodies 0 active/10; items 4/89; warehouses 3/156.
Main DB is a lean seeded demo; test DB holds tail-of-suite residue only (cleared
per-suite by `cleanup-db.ts`).

## 15. Decision Compliance (D1–D16)

| Decision | Status |
|---|---|
| D1 legacy roles removed | ✅ enum = 4 current roles; 0 legacy values |
| D2 role rename storekeeper/manager | ✅ `_migration_notes.role_rename` ×5; `sub_warehouse_manager` canonical |
| D3 no external suppliers / purchase-linked customer flow | ✅ suppliers removed; `supplier_name` free-text NOT NULL |
| D4 inventory count-only for sub-WM | ✅ D10 fallback verified |
| D5 department-managed sub-warehouse model | ✅ warehouses.department_id + scopes |
| D6 PR approval chain (sub-WM → dept → admin) | ✅ W1 traced |
| D7 POs internal-only, single intake path | ✅ no outward PO movements |
| D8 PO receive → auto draft TRF in same txn | ✅ implemented + tested |
| D9 transfer self-confirmation forbidden | ✅ 403 + tests |
| D10 count recording open to sub-WM (assigned wh only) | ✅ `inventory.service.ts:102–133` |
| D11 dept manager sees sub-warehouses only | ✅ `scope.ts:118 excludeMain` + `inventoryReport.service.ts:155` |
| D12 allocation model retired | ✅ tables/enum/perms/UI/tests gone |
| D13 permission-driven guards (not raw role) | ✅ routes gate on permissions; role used only for scoping supplements |
| D14 supervisor project-scoped requests | ✅ `material-requests.service.ts:79,219` |
| D15 material/custody two-party confirmations | ✅ §7 |
| D16 procurement auto-PO permissions | ✅ `purchase-requests:view:own` + scope (`prScopeClause` `purchase-requests.repository.ts:19–35`) |

## 16. Findings & Recommendations

1. **FINDING-1 — HIGH (functional, pre-existing):** department-assigned
   `sub_warehouse_manager` cannot view, receive, or confirm-transfer any PO
   (`purchase-orders.repository.ts:39` + `purchase-orders.service.ts:26–44`).
   **Recommend:** add the DEPARTMENT branch promised by the code's own doc
   comment, add a regression test with the production user shape, and re-run the
   D8/D9 suite.
2. **FINDING-2 — LOW (documentation):** `PHASE5_REPORT.md` §9 contradicts the
   live permission catalog (codes 75/76 deleted, not retained).
   **Recommend:** correct the statement (allowed doc-typo fix).
3. **FINDING-3 — LOW (cosmetic):** stale "allocations" comments at
   `purchase-orders.routes.ts:26` and `transactions.repository.ts:13`.
   **Recommend:** update wording.
4. **NOTE (not a defect):** `poScopeClause`'s WAREHOUSE-branch department
   sub-check (`purchase-orders.service.ts:37–41`) is dead code; fold it into the
   FINDING-1 rework.
5. **NOTE (not a defect):** transactions DEPARTMENT scope is department-wide for
   sub-WM users (all of their own department's warehouses). This is documented
   design (`transactions.service.ts:80–82`) and never crosses departments.
6. **gaps positively closing:** legacy `user_role` enum values and all
   supplier/allocation artifacts are confirmed absent — no regressions.

## 17. Verdict

**SYSTEM VERIFIED EXCEPT FINDING-1.** All schema, RBAC, workflow, security,
test, documentation, and data-integrity checks pass. The one functional defect —
department-assigned `sub_warehouse_manager` locked out of the Purchase Orders
module, which also disables the Phase 5 D8/D9 auto-transfer lifecycle for its
intended actor — must be resolved (scope-clause DEPARTMENT support + regression
test) before the system is declared production-ready. No other issues prevent
deployment.