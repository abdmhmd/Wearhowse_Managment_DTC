-- ============================================================================
-- 041_po_supplier_name_backfill.sql  (UP)
-- Phase 3 / D6: suppliers move outside the system. Before the `suppliers`
-- table is dropped, copy the display name of every referenced supplier into
-- purchase_orders.supplier_name (free text) so no data is lost.
--
-- NOT NULL is NOT set here: it becomes NOT NULL only in 042 after the column
-- has been proven fully populated (the invariant is checked there again).
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS + backfill guarded to untouched rows.
--
-- DOWN: 041_po_supplier_name_backfill.down.sql
-- ============================================================================
BEGIN;

-- 1. Add the free-text supplier column (nullable initially).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- 2. Backfill: prefer the English name, fall back to Arabic, absolute last
--    resort 'Unknown'. Guarded so re-runs never overwrite an existing value.
UPDATE purchase_orders po
   SET supplier_name = COALESCE(s.name_en, s.name_ar, 'Unknown')
  FROM suppliers s
 WHERE po.supplier_id = s.id
   AND po.supplier_name IS NULL;

-- 3. Hard abort (no silent data loss): any PO that still has a supplier_id
--    but no resolvable supplier_name must stop the migration. Also record the
--    run in _migration_notes (note_key = 'phase3_supplier_backfill').
DO $$
DECLARE
  v_orphans    int;
  v_total      int;
  v_with_supp  int;
  v_no_supp    int;
BEGIN
  SELECT count(*)
    INTO v_orphans
    FROM purchase_orders po
   WHERE po.supplier_id IS NOT NULL
     AND po.supplier_name IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Phase 3 abort: % purchase_order(s) have a supplier_id but no resolvable supplier_name. Restore from backup and investigate before re-running.', v_orphans;
  END IF;

  SELECT count(*) INTO v_total     FROM purchase_orders;
  SELECT count(*) INTO v_with_supp FROM purchase_orders WHERE supplier_id IS NOT NULL;
  SELECT count(*) INTO v_no_supp   FROM purchase_orders WHERE supplier_id IS NULL;

  INSERT INTO _migration_notes (note_key, payload)
  SELECT 'phase3_supplier_backfill',
         jsonb_build_object(
           'total_po',            v_total,
           'po_with_supplier',    v_with_supp,
           'po_without_supplier', v_no_supp,
           'backfilled',          v_with_supp
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_notes WHERE note_key = 'phase3_supplier_backfill'
  );
END $$;

COMMIT;