---
title: "Phase 3 — Suppliers Entity Removal (D6) Report"
version: "1.0"
date: "2026-09-12"
branch: "remediation/suppliers-free-text"
base_commit: "d53cec5"
tags: [phase-3, suppliers, purchase-orders, d6, wms]
---

# PHASE3_REPORT

## 1. Scope

Phase 3 / D6 removes the `suppliers` entity entirely. Purchase orders no
longer reference a supplier row through a foreign key; the supplier is a
free-text `supplier_name` column carried on the PO header. The dedicated
`suppliers` table, its permissions, its FK edges (`purchase_orders`,
`transactions`, `batches`), the backend module, and every frontend screen are
deleted. The settings key `supplier_account` is intentionally preserved (it is
a COA account name used by finance, not a supplier-table reference).

## 2. Migrations

### 2.1 `041_po_supplier_name_backfill.sql`

- Adds `purchase_orders.supplier_name TEXT NOT NULL DEFAULT ''`.
- Backfills it from joined `suppliers.name_en` (fallback `name_ar`) for POs
  that pointed at a still-existing supplier, and from the legacy
  `transactions.supplier_name` snapshot where the supplier row was already
  gone (fails a PO if any supplier could not be resolved).
- Records a `phase3_supplier_backfill` audit note in `_migration_notes`.
- `.down.sql` drops the column and deletes the note.

### 2.2 `042_drop_suppliers.sql`

- Drops `purchase_orders_supplier_id_fkey`, `idx_po_supplier`, and
  `purchase_orders.supplier_id`.
- Locks the new PO rule (T11) at the storage layer:
  `purchase_orders.supplier_name` is `NOT NULL DEFAULT ''` — an empty string
  means "no supplier" (internal / warehouse-manager requests); storage never
  holds a NULL.
- Drops `transactions_supplier_id_fkey`, `batches_supplier_id_fkey`; the
  dangling `supplier_id` columns on those two tables become ordinary nullable
  integers.
- Drops `idx_suppliers_is_active` and the `suppliers` table.
- Deletes the `suppliers:*` permissions and their `role_permissions` grants.
- Writes a `phase3_drop_suppliers` audit note.
- `.down.sql` recreates the table and FK indexes (PO snapshot rows are not
  restored — they are gone on purpose), re-adds the two nullable FKs
  guardedly, re-seeds the four permission codes without grants, and relaxes
  `supplier_name` back to nullable.

Both migrations were applied to `dtc_wms_test` and `DTC_WMS_final_db`:

| DB | 041 checksum | 042 checksum |
|---|---|---|
| `dtc_wms_test` | `2433f5e5dc10…` | `f2dec82ac50d…` |
| `DTC_WMS_final_db` | `2433f5e5dc10…` | `f2dec82ac50d…` |

Post-migration invariants verified on the main DB: `suppliers` table gone,
`supplier_id` column gone from `purchase_orders`, `supplier_name` NOT NULL,
all three FKs gone, zero `suppliers:%` permissions/grants, zero NULL
`supplier_name` rows, audit notes present.

## 3. Eight downsides solved

| # | Downside | Resolution |
|---|---|---|
| 1 | Suppliers were an in-system entity (ID + FK) with no real-world registry behind it | Removed the table; supplier identity is a free-text name on the PO |
| 2 | Every PO/tx had to name a catalog row, even internal/material-request POs with no external vendor | WM-created POs store no supplier (`NULL` ⇔ `''`) |
| 3 | A PO referencing a missing/deleted supplier left a dangling or orphaned FK | No FK; history is preserved by the copied name string |
| 4 | Demo and seed scripts had to fabricate and de-duplicate supplier rows | `supplier_name` is written directly, no seeding needed |
| 5 | UI forced picking from an unmaintainable catalog instead of typing a vendor | Admin PO form uses a free-text supplier name input |
| 6 | Duplicate / near-duplicate supplier rows polluted the catalog | No catalog to pollute |
| 7 | Four `suppliers:*` permissions and grants were needed for a low-value lookup table | Permission codes deleted; no new permission introduced |
| 8 | Editing/deleting a supplier silently mutated or blocked historical records | Historical POs keep their own snapshot of the name |

## 4. Backend changes

| Module | Change |
|---|---|
| `authorization/permissions.ts` | `suppliers:*` permission codes removed from the catalog |
| `purchase-orders` | `CreatePoInput.supplier_name: string \| null`; admin create requires a non-empty trimmed name (`SUPPLIER_REQUIRED_FOR_ADMIN_PO` → 400); WM/sub-WM create strips the client name (procurement fields are ignored, stored `''`); update trims and lets blank clear to `''`; repository INSERT stores `''` for null and every read maps `''` → `NULL` via `NULLIF` so the API reports `supplier_name: null` for internal POs; list/search filters `supplier_name ILIKE` |
| `transactions` | `supplier_id` removed from create/read paths and types |
| `batches` | `supplier_id` column reference dropped from writes |
| `items` | Drops the leftover supplier lookup in item queries |
| `app.ts` / `swagger.ts` / routes | Suppliers router + docs removed |
| scripts | All seed/repair scripts stop inserting supplier rows |

## 5. Frontend changes

- Deleted `api/suppliers.api.ts`, `hooks/useSuppliers.ts`,
  `schemas/suppliers.schema.ts`, `pages/suppliers/`.
- `types/index.ts`: `Permission` union without `suppliers:*`; `PurchaseOrder`
  carries `supplier_name: string \| null`.
- `Sidebar`, `App.tsx` routes / allowedPermissions: suppliers entry removed.
- PO list/detail render `supplier_name || '—'`; admin PO create uses a
  free-text supplier input with a placeholder; create transaction no longer
  selects a supplier.
- i18n (ar/en): removed `nav.suppliers`, `pages.suppliers`, and
  `SUPPLIER_NOT_FOUND`; added `SUPPLIER_REQUIRED_FOR_ADMIN_PO` and
  `pages.purchaseOrders.supplierPlaceholder`.

## 6. Tests

- New `tests/purchase-orders/supplier-name.test.ts`: admin PO requires a
  non-blank name; name is trimmed; updates replace or blank the name;
  WM/material-request POs are stored without a supplier and `supplier_name`
  reads back as `null`; list filter and keyword search by supplier name.
- `crud`, `wm-request-flow`, `helpers`, `scope-*`, `authorization`,
  `inventory-workflow`, `rbac/phase-2-behavior`, `error-cases`, `cleanup-db`
  updated to the free-text model; `tests/suppliers/` deleted.
- Backend: **58 suites / 560 tests pass**. Frontend: typecheck clean,
  **26 vitest tests pass**, production build succeeds.

## 7. Runtime PO rule (T11)

- Admin-created POs must carry a non-empty trimmed `supplier_name` —
  enforced in the service (`SUPPLIER_REQUIRED_FOR_ADMIN_PO`).
- Warehouse-manager / material-request POs ignore the field entirely
  (defense-in-depth: stripped at the service boundary and stored `''`).
- Internal POs therefore expose `supplier_name: null` to the API while the
  storage column stays `NOT NULL DEFAULT ''`.