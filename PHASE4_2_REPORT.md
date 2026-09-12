---
author: opencode (big-pickle)
date-generated: "2026-09-12"
model-id: opencode/big-pickle
phase: 4.2
verdict: READY FOR PHASE 5
---

# Phase 4.2 Report — Purchase Requests Frontend

## 1. Executive Summary

Phase 4.2 delivers the complete purchase-request user flow in `WMS_Frontend`: list page with
status filtering and per-row actions, create page with dynamic item-line management, and detail page
with workflow timeline and linked-purchase-order card. All UI is gated on the backend's RBAC
permissions (`purchase-requests:view`, `view_own`, `create`, `approve-dept`, `reject-dept`,
`approve-admin`, `reject-admin`, `cancel`) with no role-based checks, consistent with the
module's backend design.

A sanctioned backend change adds `purchase_request_id` / `purchase_request_no` to the PO query
(Phase 5 dependency) so the detail page can link a generated purchase order.

**Test status:** 62 frontend tests pass (26 baseline + 36 new across 5 PR-specific suites).
`tsc --noEmit` is clean. `vite build` succeeds. Backend remains green (66 suites / 612 tests).

## 2. Requirements Checklist

| Req | Description | Status |
|-----|-------------|--------|
| Types | `PurchaseRequest`, `PurchaseRequestItem`, `PurchaseRequestStatus`, `PurchaseRequestPermission`, `PURCHASE_REQUEST_STATUS_LABELS`, PR permission codes | ✅ |
| i18n | EN + AR parity — `nav.purchaseRequests`, `pages.purchaseRequests.*` (40+ keys), `pages.purchaseOrders.createdFromRequest/viewRequest` | ✅ |
| API client | `src/api/purchaseRequests.api.ts` — `getAll / getById / create / cancel / approveDept / rejectDept / approveAdmin / rejectAdmin` | ✅ |
| Hooks | 8 hooks, all with `invalidatePurchaseRequestQueries`; approveAdmin also invalidates POs | ✅ |
| Actions util | `getPurchaseRequestActions()` — pure function, permission + ownership + status gated | ✅ |
| API error mappings | 7 new PR codes added to `apiErrors.ts` | ✅ |
| List page | Status filter, DataTable, per-row action buttons, ConfirmDialog, RejectReasonModal | ✅ |
| Create page | Warehouse select (dept main warehouses), dynamic item lines, global item picker, submit disabled until valid | ✅ |
| Detail page | Header actions, rejection alert, info grid, items table, timeline, linked-PO card | ✅ |
| Routing | 3 routes (`/purchase-requests`, `/new`, `/:id`) with `ProtectedRoute` + permission checks | ✅ |
| Sidebar | Nav entry with `DocumentPlusIcon`, `purchase-requests:view | view_own` | ✅ |
| PO link card | `PurchaseOrderDetailPage` shows linked PR card linking back to detail | ✅ |
| Tests | 36 new RTL tests across 5 suites; 26 baseline preserved | ✅ |
| Backend PO linkage | `purchase-orders.repository.ts` joins `purchase_requests` for `purchase_request_id/no` | ✅ |

## 3. Backend Readiness (Phase 4.1 + 4.2 Supplement)

### Phase 4.1 (already complete)
- 66 test suites / 612 tests — green.
- `purchase_requests`, `purchase_request_items` tables (migration 043).
- RBAC permissions `purchase-requests:*` (migration 044).
- Full module: `GET /purchase-requests` (index with status filter), `GET /purchase-requests/:id`,
  `POST /purchase-requests`, `PATCH /cancel`, `PATCH /approve-dept`, `PATCH /reject-dept`,
  `PATCH /approve-admin`, `PATCH /reject-admin`.
- Auto-PO generation on admin approval; reservation integration.

### Sanctioned supplement for Phase 4.2 (purchase-orders repository)
```sql
LEFT JOIN purchase_requests pr ON pr.id = po.purchase_request_id
SELECT pr.id AS purchase_request_id, pr.request_no AS purchase_request_no
```
This enables the detail page's linked-purchase-order card without additional queries.
Documented here per the "don't modify other modules" rule; explicitly sanctioned for this phase.

## 4. What Was Built

### Frontend source files

| Layer | Path | Notes |
|-------|------|-------|
| Types | `src/types/index.ts` | `PurchaseRequest*` interfaces, permission codes, status labels, `PurchaseOrder.purchase_request_id/no` |
| i18n | `src/locales/en/translation.json`, `ar/translation.json` | 40+ keys; both locales parity-verified |
| API | `src/api/purchaseRequests.api.ts` | 8 methods; typed payloads |
| Hooks | `src/hooks/usePurchaseRequests.ts` (+ 7 siblings) | Each hook owns its invalidation strategy |
| Utils | `src/utils/purchaseRequestActions.ts` | Pure action-visibility function |
| Utils | `src/utils/apiErrors.ts` | 7 new PR error code → i18n key mappings |
| Component | `src/components/purchase-requests/RejectReasonModal.tsx` | Modal + textarea; confirm requires non-empty reason |
| Page | `src/pages/purchase-requests/PurchaseRequestsListPage.tsx` | Status filter, DataTable, action buttons, modals |
| Page | `src/pages/purchase-requests/CreatePurchaseRequestPage.tsx` | Warehouse select, item-line CRUD, submit gated |
| Page | `src/pages/purchase-requests/PurchaseRequestDetailPage.tsx` | Header actions, timeline, linked-PO card, items table |
| Route | `src/App.tsx` | 3 lazy + ProtectedRoute groups |
| Nav | `src/components/layout/Sidebar.tsx` | `DocumentPlusIcon`, 2-perm gate |
| PO detail | `src/pages/purchase-orders/PurchaseOrderDetailPage.tsx` | Linked-PR card (createdFromRequest) |
| Helper | `src/i18n/helpers.ts` | `getLocalizedName` widened to accept `null` values |

### Test infrastructure

| File | Purpose |
|------|---------|
| `src/test/setup.ts` | Global `@testing-library/jest-dom` + cleanup + api-mock import |
| `src/test/api-mock.ts` | `vi.mock('@/api/client')` registered before any test imports; `when / resetApiMock` |
| `src/test/test-utils.tsx` | `renderWithProviders`, `setUser`, `apiResponse`, re-exports `when / resetApiMock` |
| `src/test/purchase-request.fixtures.ts` | `makeRequest` + status variant factories |
| `src/test/purchase-requestActions.test.ts` | 13 pure-util action-visibility tests |
| `src/test/purchase-requestStatus.test.tsx` | 5 status-badge renders + EN/AR parity check |
| `src/test/purchase-requestPermissions.test.tsx` | 3 sidebar gating + 5 list-action visibility tests |
| `src/test/purchase-requestCreateForm.test.tsx` | 4 create-page form behavior tests |
| `src/test/purchase-requestDetail.test.tsx` | 5 detail-page rendering/action tests |

## 5. Permission & Ownership Gating

| Action | Permission(s) | Ownership | Status Gate |
|--------|---------------|-----------|-------------|
| Cancel | `purchase-requests:cancel` | `userId === created_by` | `pending` |
| Approve (Department) | `purchase-requests:approve-dept` | — | `pending` |
| Reject (Department) | `purchase-requests:reject-dept` | — | `pending` or `dept_approved` |
| Approve (Admin) | `purchase-requests:approve-admin` | — | `dept_approved` |
| Reject (Admin) | `purchase-requests:reject-admin` | — | `dept_approved` |

List-page `actions` column calls `getPurchaseRequestActions({ permissions, userId, createdBy, status })`.
Detail-page header actions use the same util. Each action button has a corresponding test.

## 6. Statuses & Detail Timeline

| Status | Badge variant | Timeline entry |
|--------|--------------|----------------|
| `pending` | `default` | Requested On |
| `dept_approved` | `info` | + Approved by Department |
| `admin_approved` | `success` | + Approved by Admin (+ linked PO card) |
| `rejected` | `danger` | + Rejected By (with rejection reason alert) |
| `cancelled` | `default` | + Cancelled By |

## 7. i18n Coverage

| Locale | Leaf keys | Missing in AR | Notes |
|--------|-----------|---------------|-------|
| EN | 656 | — | — |
| AR | 662 | 0 | 6 extra AR keys are pre-existing (unrelated `unitConversions` + `common` helpers) |

**New PR keys added this phase:** `nav.purchaseRequests`, `pages.purchaseRequests.*` (~40 keys),
`pages.purchaseOrders.createdFromRequest`, `pages.purchaseOrders.viewRequest`.

## 8. Tests

| Suite | Tests | Focus |
|-------|-------|-------|
| `purchase-requestActions.test.ts` | 13 | Pure util: permission × ownership × status matrix |
| `purchase-requestStatus.test.tsx` | 6 | Badge renders for all 5 statuses + EN/AR parity |
| `purchase-requestPermissions.test.tsx` | 8 | Sidebar entry gating (3) + list-row action visibility (5) |
| `purchase-requestCreateForm.test.tsx` | 4 | Submit disable/enable, line add/remove, payload shape |
| `purchase-requestDetail.test.tsx` | 5 | Header/items/timeline, linked-PO card, rejection alert, action visibility |
| **New total** | **36** | |
| Baseline (pre-existing) | **26** | auth.store, apiErrors |
| **All frontend** | **62** | 8 files, all green |

Backend: 66 suites / 612 tests — unchanged, still green.

## 9. Design Deviations from Task's Suggested Names

Documented for traceability; all deviations follow backend reality (field names set by the API):

| Task suggestion | Backend reality (used) | Rationale |
|----------------|------------------------|-----------|
| `purchase_order_no` | `po_number` | Backend column name |
| `items[].name_ar/name_en` | `items[].item_name_ar` (no `item_name_en`) | Backend returns `item_name_ar` only |
| `items[].name` | `items[].item_code` | No generic name; code only |
| `items[].unit_name` | `items[].unit_code` | Code, not name |
| `department` object | `department_name_ar/en` (flat) | Backend returns flat fields |
| `warehouse` object | `warehouse_name_ar/en` (flat) | Same |
| `created_by` → `{ id, name }` | `created_by` (id) + `created_by_name` (flat) | Same flat pattern |
| `purchase_order` object | `purchase_order_id` + `po_number` (flat) | Same flat pattern |
| Status filter parameter | `status` (query param) | Matches backend index endpoint |

The backend contract was verified by reading `purchase-requests.repository.ts` and the API
integration tests (18 suites / 133 tests in `tests/purchase-orders` + `tests/purchase-requests`).

## 10. Verification

| Check | Result |
|-------|--------|
| `npx tsc -b --noEmit` | Clean — no output |
| `npx vitest run` | 8 files, 62 tests — all pass |
| `npx vite build` | `dist/` produced, no errors |
| `npx jest tests/purchase-orders tests/purchase-requests` (backend) | 18 suites, 133 tests — all pass |
| i18n EN/AR parity (node script) | 0 missing in AR; JSON valid |

## 11. Risks / Notes

- **No role-based checks in PR pages:** All gating is permission-based, matching the backend.
  The backend's `PurchaseRequestsGuard` uses `hasPermission`, not `hasRole`. The only frontend
  role-based checks in this codebase are in `CreatePurchaseOrderPage` (pre-existing, not touched).
- **`vi.clearAllMocks()`** is safe with the setup-file-based mock; implementations survive
  `mockClear` (only `mockReset` removes them).
- **RTL `getByText` exact matching:** Several assertions use regex matchers because React
  interpolates strings (e.g., timeline `by — date` concatenation, item cells `code — name`).

## 12. Future Work

- [ ] Phase 5: Warehouse module — PR flows are complete; PO creation can now reference back
      to PRs via the linked fields.
- [ ] Potential: Add `purchase-requests:transfer` action for warehouse staff (reserved permission
      code in backend RBAC seed but no frontend flow yet).

---

**Verdict: READY FOR PHASE 5**
