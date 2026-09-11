-- ============================================================================
-- 034_po_received_at.down.sql (DOWN)
-- ============================================================================
BEGIN;

ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS received_at;

COMMIT;
