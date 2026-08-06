-- ============================================================================
-- 016_subcategories_and_expiry.down.sql  (DOWN)
-- Reverts 016_subcategories_and_expiry.sql
-- ============================================================================
BEGIN;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_production_before_expiry;

DROP INDEX IF EXISTS idx_td_item_expiry;
ALTER TABLE transaction_details DROP CONSTRAINT IF EXISTS chk_td_production_before_expiry;
ALTER TABLE transaction_details DROP CONSTRAINT IF EXISTS chk_td_expiry_requires_tracking;
ALTER TABLE transaction_details DROP COLUMN IF EXISTS expiry_tracking_enabled;
ALTER TABLE transaction_details DROP COLUMN IF EXISTS expiry_date;
ALTER TABLE transaction_details DROP COLUMN IF EXISTS production_date;

ALTER TABLE items DROP CONSTRAINT IF EXISTS fk_items_subcategory;
ALTER TABLE items DROP COLUMN IF EXISTS subcategory_id;
DROP INDEX IF EXISTS idx_items_subcategory;

DROP TABLE IF EXISTS subcategories;

COMMIT;
