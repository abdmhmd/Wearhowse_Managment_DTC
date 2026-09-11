-- ============================================================================
-- 034_po_received_at.sql (UP)
-- [NP5] Record physical receipt timestamp from supplier
-- ============================================================================
BEGIN;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

COMMENT ON COLUMN purchase_orders.received_at IS
  '[NP5] Timestamp of first physical stock receipt from the supplier.';

COMMIT;
