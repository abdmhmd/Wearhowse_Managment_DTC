-- ============================================================================
-- 035_po_confirmation.down.sql (DOWN)
-- ============================================================================
BEGIN;

ALTER TABLE purchase_order_allocations
  DROP COLUMN IF EXISTS pending_transaction_id,
  DROP COLUMN IF EXISTS transfer_confirmed_at,
  DROP COLUMN IF EXISTS transfer_confirmed_by;

ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS receive_confirmed_at,
  DROP COLUMN IF EXISTS receive_confirmed_by;

COMMIT;
