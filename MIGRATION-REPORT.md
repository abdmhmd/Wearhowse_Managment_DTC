# API Response Contract — Migration Report

## 1. Problem

The backend shipped with two conflicting response conventions for paginated endpoints:

- **OLD modules** (categories, units, suppliers, departments, warehouses, users, items, unit-conversions, transactions, stock-movements, reports, settings):
  `{ success: true, data: [...], pagination: { page, limit, total, totalPages } }`
- **NEW modules** (projects, custodies, material-requests, alerts, batches):
  `{ success: true, data: { items: [...], pagination: {...} } }`

The frontend typed every list endpoint as `ApiResponse<T[]>` (an array), so pages written against the new modules crashed with `data.map is not a function`. Surviving pages relied on shape-tolerant workarounds (`(data as any)?.data?.items ?? []`, `data?.data || []`) — per-page compatibility hacks.

## 2. The Contract (single, final)

```
Success single / mutation   { success: true, data: <T> | null, message?: string }
Success paginated           { success: true, data: { items: <T>[], pagination: PaginationMeta }, message?: string }
Error                       { success: false, error: { message, code?, details? } }

PaginationMeta              { page, limit, total, totalPages }
```

- `data` carries the operation result. Deletes return the removed resource.
- HTTP status codes and the error envelope are unchanged (401/404 still produce `{ success:false, error: {...} }` with `code`).

## 3. Files changed

### Backend (22 files)
- `src/utils/response.ts` — rewritten helper API:
  - Deleted the overloaded `sendSuccess(res, data, messageOrStatusCode, statusCodeOrPagination, pagination)`.
  - Added `sendData(res, data, { statusCode, message })` → `{ success, data, message? }`.
  - Added `sendPaginated(res, items, pagination, { statusCode, message })` → `{ success, data: { items, pagination } }`.
  - `sendError` unchanged; added `PaginatedData<T>` type.
- Controllers migrated to the shared helpers (old-style → new shape, new-style → same helpers for uniformity): categories, units, suppliers, departments, warehouses, users, items, unit-conversions, transactions, stock-movements, reports, settings, projects, custodies, material-requests, inventory, batches, alerts.routes, auth, and `app.ts` (health).
- No changes to services/repositories/routes — the contract lives entirely at the controller/response layer.

### Frontend (54 files)
- `src/types/index.ts` — `ApiResponse<T>` now `{ success, data, message?, error? }`; added `ApiError`, `PaginatedData<T>`, `PaginatedResponse<T>`; removed the array-typed list convention.
- All 15 API clients (`src/api/*.api.ts`) — list GETs retyped from `ApiResponse<T[]>` to `PaginatedResponse<T>`; removed dead `CategoryListResponse`; corrected `custodies.returnItem` and `transactions.approve` response types to match the backend; removed the `{ origin: 'useSettings' }` instrumentation marker.
- All 15 hooks (`src/hooks/use*.ts`) — query functions now unwrap `res.data.data`; `useCustodies` return-toast reads `data.data.data.transaction_no`; hooks expose `{ items, pagination }` to pages.
- 16 pages — `data?.data || []` → `data?.items || []`; removed all `as any` shape-tolerance (`CustodiesPage`, `ProjectsPage`, `MaterialRequestsListPage`); detail pages consume `data` directly.
- `src/api/client.ts` — removed the temporary `/api/settings` tracing instrumentation; `src/store/auth.store.ts` — removed `{ origin: 'validateToken' }`.

## 4. Before → after by endpoint group

| Endpoint group | Before | After | Breaking? |
|---|---|---|---|
| Auth login/refresh, health, GET /api/settings | `{ success, data }` | same | No |
| CREATE/PUT/PATCH/DELETE mutations | `{ success, data: <entity>, message? }` | same | No |
| Paginated list GETs — old modules | `{ success, data: [...], pagination }` | `{ success, data: { items, pagination } }` | **Yes** |
| Paginated list GETs — new modules | `{ success, data: { items, pagination } }` | same | No |
| Single-resource GETs | `{ success, data: <entity> }` | same | No |
| Errors | `{ success: false, error: { message, code, details } }` | same | No |

## 5. Why this shape

- Matches the convention already shipped by the newer modules (projects, custodies, requests).
- `PaginatedData<T>` is a single typed shape on both sides: frontend reads `data.items` / `data.pagination` with zero branching.
- Error envelope and status codes are untouched, so the only breaking change is mechanical (11 list endpoints).

## 6. Breaking changes

1. **11 paginated list endpoints** moved `items`/`pagination` inside `data`. Old consumers reading `body.data` as an array must read `body.data.items`; `body.pagination` is now `body.data.pagination`. Endpoints affected: categories, units, suppliers, departments, warehouses, users, items, unit-conversions, transactions, stock-movements, reports.
2. `transactionsApi.approve` response type corrected to `Transaction` (backend already returned it).
3. `custodiesApi.returnItem` response type corrected to `{ message, transaction_id, transaction_no }`.
4. Imports of the deleted `sendSuccess` helper must switch to `sendData`/`sendPaginated` (only controllers used it; no tests reference it).

## 7. Strategy

- Single source of truth on the backend: `sendPaginated` is the only way a list endpoint responds; `sendData` the only way a single/mutation responds.
- Single source of truth on the frontend: `PaginatedResponse<T>` is the only list type; hooks always unwrap to `{ items, pagination }`.
- No per-page compatibility logic remains. No `as any` response access remains in pages.

## 8. Verification

- `npx tsc -b` (frontend) and `npx tsc --noEmit` (backend) — both clean.
- Backend live smoke test: list endpoints return `data: { items, pagination }`; settings/health/logout return `data`; 404 and 401 return `{ success: false, error: { message, code, details } }`.
- Playwright (headless Chrome) over 16 pages + 2 create pages + 3 detail pages: every page renders the expected `h1`, every list page renders its table, **0 console errors, 0 failed requests**. Detail pages for nonexistent ids render the graceful "not found" state without crashing.

## 9. Follow-up (out of scope, pre-existing)

- `reportsApi.getItemCard` and `useItem` are unused exports. `itemsApi.getById` is typed `ApiResponse<Item>` but the endpoint returns an `ItemCard` at runtime — latent mismatch, currently dead code.
