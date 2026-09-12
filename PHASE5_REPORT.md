---
author: opencode (big-pickle)
date-generated: "2026-09-12"
model-id: opencode/big-pickle
phase: 5
verdict: READY FOR PHASE 6
---

# Phase 5 Report — Purchase Order Auto-Transfer (D8) & Allocation Removal

## 1. Executive Summary

Phase 5 completes the purchase-order delivery lifecycle and removes the entire
allocation model:

- **D7 (verified, no code change):** Purchase Orders are internal-only. There are no
  suppliers, no customer orders, and no outward movements from POs. The "main
  warehouse receiving + sub-warehouse distribution" model is the single intake path.
- **D8 (implemented):** Receiving against a PR-linked purchase order now auto-creates a
  **draft TRF (Transfer)** to the request creator's sub-warehouse **inside the same
  transaction** as the RV. A new PO-scoped endpoint `POST /purchase-orders/:id/confirm-transfer`
  confirms the transfer (movement realises: stock leaves the main warehouse and enters
  the sub-warehouse), with D9 two-party confirmation rules.
  - Destination = the PR creator's uniquely assigned active, non-main warehouse in the
    same department. 0 → `NO_TRANSFER_DESTINATION`, >1 → `AMBIGUOUS_TRANSFER_DESTINATION`;
    both roll back the entire receive transaction.
- **Allocation model removed** from the entire stack: tables, enum, endpoints,
  permissions, frontend UI, hooks/API/types, audit events, and tests. Migrations
  045/046 applied to both test and main databases (46/46, checksum-verified).

**Test status:** Backend 62 suites / 598 tests green; frontend 8 files / 62 tests green;
`tsc --noEmit` clean on both; `vite build` succeeds.

## 2. Requirements Checklist

| Req | Description | Status |
|-----|-------------|--------|
| D7 | Verified POs are internal-only; no code change required | ✅ |
| D8 | PO receive auto-creates draft TRF to PR creator's sub-warehouse in the same txn | ✅ |
| D8 | New `POST /purchase-orders/:id/confirm-transfer` (gated `purchase-orders:receive`) | ✅ |
| D8 | Two-party confirmation: TRF `created_by === user.id` → ForbiddenError | ✅ |
| D8 | Partial receives: one draft TRF per receive; confirmTransfer approves ALL draft TRFs | ✅ |
| D8 | `NO_TRANSFER_DESTINATION` / `AMBIGUOUS_TRANSFER_DESTINATION` roll back the RV | ✅ |
| Allocation | Table, `AllocationStatus` enum, endpoints, permissions removed | ✅ |
| Allocation | Frontend UI/hooks/API/types/i18n removed | ✅ |
| Allocation | Audit events `PO_ALLOCATED`/`PO_ALLOCATION_CANCELLED`/`PO_TRANSFERRED` removed | ✅ |
| DB | Migrations 045/046 (+ working DOWNs), replay-safe; applied to test + main | ✅ |
| Tests | Backend 598/598 (PO 81, auto-transfer 5 scenarios) | ✅ |
| Tests | Frontend typecheck/build/jest green | ✅ |
| Commit | 7 logical chunks, repo-style messages | ✅ |

## 3. D8 Design

### 3.1 Destination resolution (sanctioned decision)

The auto-TRF destination is the **PR creator's** (`pr.created_by`) uniquely assigned
active, non-main warehouse in the **same department**, derived via `user_warehouses`
joined on `w.department_id = pr.department_id`. Rationale: the receiver and the requester
are the same person in the common flow; the derived warehouse is the user's own
sub-warehouse so stock lands where the requester can use it.

- 0 destinations → `NO_TRANSFER_DESTINATION` → RV rolls back.
- >1 destinations → `AMBIGUOUS_TRANSFER_DESTINATION` → RV rolls back.

### 3.2 Receive (RV + auto-TRF) flow

```
receive(id, lines)
  ├─ UPDATE purchase_order_lines (quantity_received += qty)
  ├─ UPDATE purchase_orders SET status = received|partially_received, received_at
  ├─ (TRANSACTION SAVEPOINT semantics: single txn)
  ├─ RV transaction created (type RV, status approved)
  ├─ IF PR-linked:
  │    ├─ resolve destination (0/>1 → throw, rollback)
  │    ├─ createDraft TRF (type TRF, status draft, to sub-warehouse)
  │    └─ UPDATE purchase_orders SET linked_transfer_id = trf.id, auto_transfer_created = true
  └─ RETURN transaction_no, auto_transfer_created, linked_transfer_no
```

### 3.3 confirmTransfer flow

```sql
SELECT id, transaction_no, created_by, status FROM transactions
 WHERE purchase_order_id = $1 AND type = 'TRF' AND status = 'draft'
 ORDER BY id
```
- Confirms **every** draft TRF for the PO via `transactionsService.approveTransaction`
  (handles multiple partial receives).
- Two-party check per TRF: if `trf.created_by === user.id` → ForbiddenError.
- Guards: `linked_transfer_id == null` → `NO_LINKED_TRANSFER`; no draft TRFs left →
  `LINKED_TRANSFER_ALREADY_CONFIRMED` (409).
- Returns `{ transfer_count, transaction_no (last confirmed) }`.

### 3.4 Bug fixed in this phase

`close()` and `confirmTransfer()` previously chased only the single
`linked_transfer_id`; the second partial receive would overwrite `linked_transfer_id`
and leave the first draft TRF dangling forever. Both now query **all** draft TRFs by
`purchase_order_id`.

## 4. Schema Changes (Migrations 045 / 046)

### 045_po_auto_transfer.sql
- `purchase_orders.linked_transfer_id` (FK → `transactions.id`, ON DELETE SET NULL)
- `purchase_orders.auto_transfer_created boolean NOT NULL DEFAULT false`
- `purchase_orders.receive_confirmed_by` (FK → `users.id`, ON DELETE SET NULL)
- `purchase_orders.receive_confirmed_at timestamptz`
- index on `transactions(purchase_order_id, type, status)` for confirm queries

### 046_drop_allocations.sql
- `DROP TABLE purchase_order_allocations`
- `DROP TYPE allocation_status`
- `DROP INDEX po_allocations_po_detail_idx` (pre-existing dependency ordering: allocations
  dropped before the PO table's FK)
- Audit union updated to remove allocation events

Both have working `.down.sql` (045 down removes columns+index; 046 down recreates the
table/type, matching the pre-045 shape). Replay-safe: guarded where required; test DB down
→ up cycle verified.

## 5. Backend Changes

| Area | Change |
|------|--------|
| `purchase-orders.service.ts` | Receive auto-TRF, confirmTransfer (multi-TRF), close() draft-TRF guard, `NO_MAIN_WAREHOUSE` on creation, remove allocate/transferAllocation/cancelAllocation |
| `purchase-orders.repository.ts` | PO_SELECT + service REPO_SELECT: `linked_transfer_no/status/dest_warehouse_*`, `purchase_request_no`, `receive_confirmed_by/at` + `LEFT JOIN users ru`; allocation methods removed |
| `purchase-orders.controller.ts` / `.routes.ts` | 5 allocation routes removed; `POST /:id/confirm-transfer` added |
| `purchase-orders.types.ts` | `AllocationStatus`, `ALLOCATABLE_STATUSES` removed |
| `purchase-orders.validator.ts` | allocate/transfer schemas removed |
| `stock-availability.ts` | **deleted** (allocation helper) |
| `authorization/audit.service.ts` | `PO_ALLOCATED` / `PO_ALLOCATION_CANCELLED` / `PO_TRANSFERRED` removed; `PO_TRANSFER_CONFIRMED` kept |
| `items/items.repository.ts`, `reports/inventoryReport.service.ts` | allocation aggregation columns removed |

## 6. Frontend Changes

| File | Change |
|------|--------|
| `src/types/index.ts` | Removed `AllocationStatus`, `PurchaseOrderAllocation`, `purchase-orders:allocate/transfer`, `quantity_allocated`/`quantity_transferred`, `allocations`. Added `linked_transfer_*` (no/id/status/dest code+names), `receive_confirmed_by/at/_name` |
| `src/api/purchase-orders.api.ts` | Removed `allocate`, `transfer`, `confirmTransfer(allocationId)`; `confirmTransfer(id)` now PO-scoped `POST /purchase-orders/:id/confirm-transfer` |
| `src/hooks/usePurchaseOrders.ts` | Removed `useAllocateStock`/`useTransferAllocation`/`useConfirmTransferAllocation`; added `useConfirmPurchaseOrderTransfer` |
| `src/pages/purchase-orders/PurchaseOrderDetailPage.tsx` | Removed allocate/transfer dialogs, allocation table, dest-warehouse picker, alloc buttons/columns. Added **linked-transfer card** (no / status badge / destination) with confirm-transfer button when draft + `purchase-orders:receive` |
| `src/utils/apiErrors.ts` | Allocation codes removed; added `NO_TRANSFER_DESTINATION`, `AMBIGUOUS_TRANSFER_DESTINATION`, `NO_LINKED_TRANSFER`, `LINKED_TRANSFER_ALREADY_CONFIRMED` |
| `src/utils/apiErrors.test.ts` | Allocation mappings/tests removed; `poKeys` completeness list updated |
| i18n `en`/`ar` | Allocation keys removed; `linkedTransfer.*` + new error keys added; `allocatedStock` (unused) removed |

Permission codes `purchase-orders:allocate` / `purchase-orders:transfer` remain in the
backend RBAC permission catalog seed (migration 033/017). They are no longer referenced by
any code path and are safe to leave (surfacing them in the frontend `Permission` union was
dropped to force compile-time detection of leaks).

## 7. Tests

### Backend (62 suites / 598 tests — ALL green)
| Suite | Tests | Notes |
|-------|-------|-------|
| `tests/purchase-orders/auto-transfer.test.ts` (NEW) | 5 | T1 full receive → TRF → confirm → close; T2 partial receives → multi-TRF → single confirm clears all; T3 standalone PO no auto-TRF; T4 no destination → RV rollback; T5 ambiguous destination → RV rollback |
| `tests/purchase-orders/integration-e2e.test.ts` | rewritten | create → approve → receive 60/40 → confirm-receive → close (standalone, no TRF) |
| `tests/purchase-orders/permissions.test.ts` | updated | ENDPOINTS without allocate/transfer; admin catalog 7 perms; confirm-transfer routes |
| `tests/purchase-orders/scope-security.test.ts` | updated | confirm-transfer scope: foreign PO 404, in-scope no-linked 400, foreign WM 404 |
| `tests/rbac/phase-2-behavior.test.ts` | updated | D9 rewritten to PR → auto-PO → auto-TRF flow |
| Deleted | `allocation`, `atomicity`, `availability`, `concurrency`, `transfer-partial` | model removed |

### Frontend (8 files / 62 tests — ALL green)
Typecheck (`tsc -b --noEmit`), `vitest run`, and `vite build` all pass.

## 8. Verification

| Check | Result |
|-------|--------|
| Backend `tsc --noEmit` | Clean |
| Backend `jest` (test DB) | 62 suites / 598 tests pass |
| Frontend `npx tsc -b --noEmit` | Clean |
| Frontend `npx vitest run` | 62 tests pass |
| Frontend `npx vite build` | `dist/` built |
| Test DB `npm run migrate -- --verify` | 46/46, no mismatches |
| Main DB `npm run migrate -- --verify` | 46/46, no mismatches (migrations 045/046 applied) |

## 9. Design Decisions & Deviations

| Item | Decision |
|------|----------|
| Transfer destination | PR creator's uniquely assigned active non-main warehouse in the same department (approved by user; unambiguous, role-consistent) |
| Confirm-transfer gating | Reuses `purchase-orders:receive` — the same permission that drafts the transfer |
| Multi-TRF confirm | Always confirms ALL draft TRFs for the PO, not just the latest `linked_transfer_id` |
| `PO_CANNOT_CLOSE` / `INVALID_DESTINATION_WAREHOUSE` codes | Removed from frontend `apiErrors.ts` along with the model (the close guard no longer references transfers) |
| Left-in RBAC codes | `purchase-orders:allocate` / `purchase-orders:transfer` remain in the DB permission catalog but are unreferenced |

## 10. Risks / Notes

- **Pre-existing data:** no `purchase_order_allocations` rows existed in test/main; the
  drop is non-destructive here. Any environment with rows would need a data-archival step.
- **FK safety** confirmed via script against both DBs: `transactions.purchase_order_id`,
  `purchase_requests.purchase_order_id`, `purchase_orders.linked_transfer_id` are all
  `ON DELETE SET NULL`; cleanup order is safe.
- **Two-party rule is backend-enforced:** the UI shows confirm buttons to any
  `purchase-orders:receive` user when the TRF is draft; the server rejects self-confirmation.

## 11. Future Work

- [ ] Phase 6: Warehouse module / inventory counting reconciliation.
- [ ] Consider pruning `purchase-orders:allocate` / `purchase-orders:transfer` from the
      RBAC catalog seed (migration) now that no code references them.
- [ ] Optional: show `linked_transfer_id` history (multiple partial TRFs) as a list rather
      than the latest card.

---

**Verdict: READY FOR PHASE 6**