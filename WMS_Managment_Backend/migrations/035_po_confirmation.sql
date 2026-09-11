-- ============================================================================
-- 035_po_confirmation.sql (UP)
-- [NP3] Explicit confirmation for receipt and transfer movements
-- ============================================================================
BEGIN;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS receive_confirmed_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS receive_confirmed_at TIMESTAMPTZ;

ALTER TABLE purchase_order_allocations
  ADD COLUMN IF NOT EXISTS transfer_confirmed_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS transfer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_transaction_id INTEGER REFERENCES transactions(id);

COMMENT ON COLUMN purchase_orders.receive_confirmed_by IS '[NP3] User who confirmed physical receipt.';
COMMENT ON COLUMN purchase_orders.receive_confirmed_at IS '[NP3] Timestamp when physical receipt was confirmed.';
COMMENT ON COLUMN purchase_order_allocations.transfer_confirmed_by IS '[NP3] User who confirmed physical transfer.';
COMMENT ON COLUMN purchase_order_allocations.transfer_confirmed_at IS '[NP3] Timestamp when physical transfer was confirmed.';
COMMENT ON COLUMN purchase_order_allocations.pending_transaction_id IS '[NP3] Transaction awaiting confirmation.';

COMMIT;
