-- ============================================================================
-- 033_purchase_orders.down.sql  (DOWN)
-- Reverts 033_purchase_orders.sql:
--   role_permissions -> permissions -> triggers/functions ->
--   transactions.purchase_order_id -> tables -> sequence -> enum types.
-- Existing transaction rows keep their data; the nullable purchase_order_id
-- column is dropped together with its FK and index BEFORE the PO tables are
-- dropped (the FK references purchase_orders).
-- ============================================================================
BEGIN;

-- 1. Permission grants + catalog ----------------------------------------------
DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.id
  AND p.code LIKE 'purchase-orders:%';

DELETE FROM permissions WHERE code LIKE 'purchase-orders:%';

-- 2. Triggers + functions ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_poa_warehouses ON purchase_order_allocations;
DROP FUNCTION IF EXISTS enforce_po_allocation_warehouses();
DROP TRIGGER IF EXISTS trg_poa_updated_at ON purchase_order_allocations;
DROP TRIGGER IF EXISTS trg_pod_updated_at ON purchase_order_details;
DROP TRIGGER IF EXISTS trg_po_main_warehouse ON purchase_orders;
DROP FUNCTION IF EXISTS enforce_po_main_warehouse();
DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;

-- 3. Transactions integration (must go before dropping PO tables) ----------------
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_purchase_order_id;
DROP INDEX IF EXISTS idx_transactions_purchase_order;
ALTER TABLE transactions DROP COLUMN IF EXISTS purchase_order_id;

-- 4. Tables (child first) -------------------------------------------------------
DROP TABLE IF EXISTS purchase_order_allocations;
DROP TABLE IF EXISTS purchase_order_details;
DROP TABLE IF EXISTS purchase_orders;

-- 5. Sequence ---------------------------------------------------------------------
DROP SEQUENCE IF EXISTS po_no_seq;

-- 6. Enum types ---------------------------------------------------------------------
DROP TYPE IF EXISTS allocation_status;
DROP TYPE IF EXISTS purchase_order_status;

COMMIT;
