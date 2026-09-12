-- ============================================================================
-- 041_po_supplier_name_backfill.down.sql  (DOWN)
-- Reverts the supplier_name column and the backfill note.
-- Does NOT touch the `suppliers` table (that is 042's scope).
-- ============================================================================
BEGIN;

ALTER TABLE purchase_orders DROP COLUMN IF EXISTS supplier_name;

DELETE FROM _migration_notes WHERE note_key = 'phase3_supplier_backfill';

COMMIT;