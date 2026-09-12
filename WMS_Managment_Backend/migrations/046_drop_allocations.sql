-- ============================================================================
-- 046_drop_allocations.sql  (UP)
-- Phase 5 / D8 — remove the stock-allocation model entirely.
--
-- D8 replaces reservation-based allocation with a direct, two-party movement:
-- PO receive (RV into the department MAIN warehouse) auto-creates a draft
-- Transfer (TRF) to the request creator's sub-warehouse, which a second user
-- confirms via POST /purchase-orders/:id/confirm-transfer.
--
-- This migration removes:
--   * every purchase_order_allocations row (recorded for audit first),
--   * the purchase_order_allocations table and its trigger function,
--   * the allocation_status enum type,
--   * the purchase-orders:allocate and purchase-orders:transfer permissions
--     (catalog codes and grants).
--
-- Stock safety: allocations are a pure reservation overlay over
-- item_warehouse_stock.current_balance. Deleting rows releases reservations
-- only — no physical quantity is destroyed, so a pre-flight count is recorded
-- in _migration_notes instead of aborting.
--
-- Replay-safe: all drops use IF EXISTS; the note is written only once.
-- DOWN: 046_drop_allocations.down.sql
-- ============================================================================
BEGIN;

-- 1. Record the volume being removed, then release reservations ----------------
DO $$
DECLARE
  v_alloc_rows INTEGER := 0;
  v_open_qty   NUMERIC := 0;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(quantity_allocated - quantity_transferred), 0)
    INTO v_alloc_rows, v_open_qty
    FROM purchase_order_allocations;

  DELETE FROM purchase_order_allocations;

  INSERT INTO _migration_notes (note_key, payload)
  SELECT 'phase5_drop_allocations',
         jsonb_build_object(
           'allocation_rows_deleted',        v_alloc_rows,
           'open_reservation_qty_released',  v_open_qty,
           'table_dropped',                  'purchase_order_allocations',
           'enum_dropped',                   'allocation_status',
           'trigger_function_dropped',       'enforce_po_allocation_warehouses',
           'permissions_removed',            ARRAY['purchase-orders:allocate', 'purchase-orders:transfer'],
           'replacement',                    'D8 auto-TRF on PO receive + POST /:id/confirm-transfer'
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_notes WHERE note_key = 'phase5_drop_allocations'
  );
END $$;

-- 2. Permissions: grants first, then catalog codes -----------------------------
DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.id
  AND p.code IN ('purchase-orders:allocate', 'purchase-orders:transfer');

DELETE FROM permissions
WHERE code IN ('purchase-orders:allocate', 'purchase-orders:transfer');

-- 3. Structural removal --------------------------------------------------------
DROP TABLE IF EXISTS purchase_order_allocations;
DROP FUNCTION IF EXISTS enforce_po_allocation_warehouses();
DROP TYPE IF EXISTS allocation_status;

COMMIT;
