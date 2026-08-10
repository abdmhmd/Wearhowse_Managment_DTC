-- ============================================================================
-- 021_add_stock_movement_warehouse.down.sql
-- ============================================================================
BEGIN;

DROP INDEX IF EXISTS idx_stock_movements_warehouse;
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS fk_stock_movements_warehouse;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS warehouse_id;

COMMIT;
