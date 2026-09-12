-- ============================================================================
-- 045_po_auto_transfer.down.sql  (DOWN)
-- Reverts 045_po_auto_transfer.sql:
--   index -> columns -> migration note.
-- ============================================================================
BEGIN;

DROP INDEX IF EXISTS idx_po_linked_transfer;

ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS auto_transfer_created,
  DROP COLUMN IF EXISTS linked_transfer_id;

DELETE FROM _migration_notes WHERE note_key = 'phase5_auto_transfer_columns';

COMMIT;
