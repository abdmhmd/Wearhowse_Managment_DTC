-- ============================================================================
-- 015_add_location_tracking.down.sql  (DOWN / rollback)
-- Exactly reverses 015_add_location_tracking.sql:
--   1. drop the FK on item_warehouse_stock.location_id
--   2. drop the column
--   3. drop the trigger
--   4. drop the locations table
-- Order matters: constraints/triggers must go before the table.
-- ============================================================================
BEGIN;

ALTER TABLE item_warehouse_stock DROP CONSTRAINT IF EXISTS fk_iws_location;
ALTER TABLE item_warehouse_stock DROP COLUMN IF EXISTS location_id;

DROP TRIGGER IF EXISTS trg_locations_updated_at ON locations;

DROP TABLE IF EXISTS locations;

COMMIT;
