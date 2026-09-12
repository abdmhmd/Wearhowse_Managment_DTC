---
title: Warehouse Department UI Integration Report
type: ui-integration
module: warehouses
backend_changes: true
migration_needed: false
status: complete
created: 2026-09-12
---

# Warehouse Department UI Integration Report

## 1. What Was Missing

The backend already stored `warehouses.department_id` and `warehouses.is_main`
(added in the warehouse-routing phase, migration `020_warehouse_routing_constraints`),
but the frontend provided **no way to view or manage either field**:

| Screenshot observation | Description |
|---|---|
| Warehouses list | Only showed Code, Name, Location, Created. The department a warehouse belongs to and whether it is a main/sub warehouse were **hidden fields** — never fetched, displayed, or editable. |
| Create / Edit warehouse form | Only collected `code`, `name_ar`, `location`. No department selector and no "main warehouse" toggle. |

Consequently an admin could not:
- See which department owns a warehouse, or which warehouse is the main one per
  department (columns missing).
- Link/unlink a warehouse to a department (form field missing).
- Promote/demote a warehouse to/from main (form field missing).
- Filter the list by department or by type (no filters at all).

## 2. What Was Added

| File | Change |
|---|---|
| `WMS_Frontend/src/types/index.ts` | `Warehouse` now exposes `department_name_ar` / `department_name_en` (returned by the backend join). |
| `WMS_Frontend/src/api/warehouses.api.ts` | `getAll(page, limit, filter?)` accepts `{ department_id?, is_main? }`; create/update payloads accept `is_main` and `department_id` (`null` clears/left empty = central). |
| `WMS_Frontend/src/hooks/useWarehouses.ts` | `useWarehouses(page, limit, filter?)` scopes the query key by filter. |
| `WMS_Frontend/src/schemas/warehouses.schema.ts` | `department_id` (preprocess `'' → null`, int, nullable) and `is_main` boolean fields. |
| `WMS_Frontend/src/pages/warehouses/WarehousesPage.tsx` | Adds **Department** and **Type** columns (Main = success badge, Sub = default badge; central = "—"); department + type filter bar; form gains a Department selector ("Central (No Department)" = cleared) and a "Main Warehouse" toggle with help text; client-side pre-check blocks a second main in the same department before the request. |
| `WMS_Frontend/src/utils/apiErrors.ts` | Maps backend codes `MAIN_WAREHOUSE_EXISTS` and `DEPARTMENT_NOT_FOUND` to friendly i18n messages. |
| `WMS_Frontend/src/locales/en/translation.json` | 11 new keys under `pages.warehouses`. |
| `WMS_Frontend/src/locales/ar/translation.json` | 11 new keys under `pages.warehouses` (parity, see §5). |
| `WMS_Managment_Backend/src/modules/warehouses/warehouses.repository.ts` | `findAll` / `findById` / `countAll` now `LEFT JOIN departments` (aliased `w` to keep scope clauses unambiguous) and return `department_name_ar/en`; `findAll` / `countAll` accept `{ department_id?, is_main? }` filters. |
| `WMS_Managment_Backend/src/modules/warehouses/warehouses.service.ts` | `getAll` passes list filters through; guarantees the referenced department exists; business errors carry explicit codes (`MAIN_WAREHOUSE_EXISTS`, `DEPARTMENT_NOT_FOUND`). |
| `WMS_Managment_Backend/src/modules/warehouses/warehouses.controller.ts` | Parses `department_id` / `is_main` query params for list filtering. |
| `WMS_Managment_Backend/src/modules/departments/departments.repository.ts` | Added `findById(id)` (referential-integrity pre-check, no scope). |
| `WMS_Frontend/src/__tests__/warehouses.test.tsx` | New UI test suite (see §6). |
| `WMS_Managment_Backend/tests/warehouses/warehouses.test.ts` | 5 new backend cases (see §6). |

## 3. Validation Rules

| Rule | Where | Message |
|---|---|---|
| A department must exist when linking it to a warehouse | Backend `WarehousesService.assertDepartmentExists` (create + update), HTTP 404 code `DEPARTMENT_NOT_FOUND` | "The selected department does not exist." (`pages.warehouses.errors.DEPARTMENT_NOT_FOUND`) |
| Only one active main warehouse per department | Backend `WarehousesService` via `findActiveMain` (already existed; now error carries code `MAIN_WAREHOUSE_EXISTS`) + migration 020 partial unique index backstop | "This department already has a main warehouse." (`pages.warehouses.errors.MAIN_WAREHOUSE_EXISTS`) |
| Same rule — client-side pre-check before submitting | `WarehousesPage` scans the loaded warehouse set; if another main exists in the chosen department it sets a field error on the toggle and aborts | Same `MAIN_WAREHOUSE_EXISTS` message |
| `department_id` may be cleared (`null` = central warehouse) | Backend update path (`department_id: null`), schema nullable + `''` → `null` in the form selector | — |
| `is_main` may be set/unset freely (subject to uniqueness above) | Backend update/create path; form toggle defaults to `false` on create | — |

## 4. UI Screenshots (ASCII)

```
┌─ Warehouses ──────────────────────────────────────────────────────────────┐
│  Warehouses                          [Create Warehouse]                    │
│  Manage warehouse locations                                                │
│  Filter by Department: [All ▾]   Filter by Type: [All ▾]                   │
│  ┌───────┬──────────────────┬───────────────────┬──────────┬───────────┐  │
│  │ Code  │ Name             │ Department        │ Type     │ Created   │  │
│  ├───────┼──────────────────┼───────────────────┼──────────┼───────────┤  │
│  │ WH-M  │ Main Warehouse   │ IT Department     │ [Main]   │ 01/01/26  │  │
│  │ WH-S  │ Sub Warehouse    │ IT Department     │ [Sub]    │ 01/01/26  │  │
│  │ WH-C  │ Central          │ —                 │ [Sub]    │ 01/01/26  │  │
│  └───────┴──────────────────┴───────────────────┴──────────┴───────────┘  │
└───────────────────────────────────────────────────────────────────────────┘

┌─ Create Warehouse (modal) ─────────────────────────────────────────┐
│  Code        [ WH-X            ]                                   │
│  Name        [ Extra           ]                                   │
│  Location    [                 ]                                   │
│  Department  [ IT Department ▾ ]          (or Central (No Dept.))  │
│  ☑ Main Warehouse                                                  │
│  The main warehouse receives from suppliers. Each department has   │
│  at most one main warehouse.                                       │
│                                        [Cancel]  [Save]            │
└────────────────────────────────────────────────────────────────────┘
```

## 5. i18n Coverage

| Locale | Keys added under `pages.warehouses` | Parity |
|---|---|---|
| English (`src/locales/en/translation.json`) | 11 | ✓ |
| Arabic (`src/locales/ar/translation.json`) | 11 | ✓ |

Added keys: `department`, `noDepartment`, `isMain`, `isMainHelp`, `type`,
`typeMain`, `typeSub`, `filterByDepartment`, `filterByType`,
`errors.MAIN_WAREHOUSE_EXISTS`, `errors.DEPARTMENT_NOT_FOUND`.

## 6. Tests

| Suite | Tests | Status |
|---|---|---|
| `WMS_Managment_Backend/tests/warehouses/warehouses.test.ts` — filters by `department_id` + returns department display names | 1 | ✅ |
| — filters by `is_main` (main vs sub) | 1 | ✅ |
| — clears the department link with `department_id: null` | 1 | ✅ |
| — rejects non-existent department with `DEPARTMENT_NOT_FOUND` | 1 | ✅ |
| — conflict error carries `MAIN_WAREHOUSE_EXISTS` code | 1 | ✅ |
| `WMS_Frontend/src/__tests__/warehouses.test.tsx` — Department column + em dash + Type badges | 1 | ✅ |
| — department filter sends `department_id` param | 1 | ✅ |
| — type filter sends `is_main` param (main + sub) | 1 | ✅ |
| — form shows department dropdown + main toggle | 1 | ✅ |
| — client-side block of second main in same department (no POST) | 1 | ✅ |
| — central submission sends `department_id: null`, `is_main: false` | 1 | ✅ |

## 7. Backend Changes

**Migration needed: NO.** Column types and the partial unique index already
exist (`020_warehouse_routing_constraints.sql`). Backend work was limited to
read/filter/validation plumbing; RBAC/permission logic was untouched.

- Repository: department join + display names, list filters, scoped `w.` aliases.
- Service: filter pass-through, department-existence guard (new `DEPARTMENT_NOT_FOUND`,
  HTTP 404), explicit `MAIN_WAREHOUSE_EXISTS` code on the pre-existing uniqueness check.
- Controller: `department_id` / `is_main` query parsing.
- `DepartmentsRepository.findById` added for the existence check.

## 8. Verification

| Check | Result |
|---|---|
| Backend `npx tsc --noEmit` | ✅ clean |
| Backend `npm test` | ✅ 620 passed (64 suites) |
| Frontend `npm run typecheck` | ✅ clean |
| Frontend `npm test` | ✅ 84 passed (10 files) |
| Frontend `npm run build` | ✅ vite build OK |

## 9. Residual Notes

- **Existing rows:** warehouses created before the routing migration keep
  `department_id = NULL` and render as "Central (No Department)" with the `Sub`
  type badge and a "—" department cell — display is correct with no data fix.
- **Race window:** the DB partial unique index (`020`) is the final backstop; a
  concurrent create/update in the same department can surface as a raw PG
  `23505` (HTTP 500) because there is no global 23505→409 handler. The service
  check covers normal (sequential) submissions. Left as-is to avoid touching
  shared error handling; documented here.
- **Non-existent department:** now rejected with HTTP 404 `DEPARTMENT_NOT_FOUND`
  instead of the previous raw FK `23503` (500) — a real validation gap this work
  closes.
- **Client pre-check scope:** the conflict pre-check scans the loaded warehouse
  set (`useAllWarehouses`, limit 200) before submit; if a conflicting main lives
  beyond that page window or behind active filters, the backend
  `MAIN_WAREHOUSE_EXISTS` error surfaces through the toast as the backstop.