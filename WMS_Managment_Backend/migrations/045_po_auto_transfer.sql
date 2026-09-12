-- ============================================================================
-- 045_po_auto_transfer.sql  (UP)
-- Phase 5 / D8 — PO receive auto-creates a Transfer (TRF) to the linked
-- purchase request's sub-warehouse.
--
-- Adds the linkage columns used by the receive-time auto-TRF:
--   * linked_transfer_id   — the most recent TRF generated on receive (partial
--                            receives create one TRF each, so this tracks the
--                            latest). ON DELETE SET NULL so removing a voucher
--                            never blocks a PO.
--   * auto_transfer_created — true once at least one auto-TRF has been written.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS; the note
-- is written only once.
-- DOWN: 045_po_auto_transfer.down.sql
-- ============================================================================
BEGIN;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS linked_transfer_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_transfer_created BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_po_linked_transfer ON purchase_orders(linked_transfer_id);

COMMENT ON COLUMN purchase_orders.linked_transfer_id IS
  '[D8] Most recent auto-created TRF voucher generated when stock was received for a PR-linked purchase order.';
COMMENT ON COLUMN purchase_orders.auto_transfer_created IS
  '[D8] True once receive auto-created at least one draft TRF to the request creator''s sub-warehouse.';

-- Migration ledger ------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO _migration_notes (note_key, payload)
  SELECT 'phase5_auto_transfer_columns',
         jsonb_build_object(
           'columns_added', ARRAY['linked_transfer_id', 'auto_transfer_created'],
           'index_added',   'idx_po_linked_transfer',
           'purpose',       'D8 auto-TRF linkage recorded on PO receive for PR-linked purchase orders'
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_notes WHERE note_key = 'phase5_auto_transfer_columns'
  );
END $$;

COMMIT;
