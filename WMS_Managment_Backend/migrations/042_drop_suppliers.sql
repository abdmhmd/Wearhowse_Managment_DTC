-- ============================================================================
-- 042_drop_suppliers.sql  (UP)
-- Phase 3 / D6: remove the suppliers entity entirely.
--   * Drops the purchase_orders.supplier_id FK + column (name lives in
--     supplier_name after 041 backfilled it).
--   * Locks purchase_orders.supplier_name NOT NULL DEFAULT '' after proving
--     no NULLs remain.
--   * ALSO drops transactions_supplier_id_fkey and batches_supplier_id_fkey:
--     PostgreSQL refuses to drop the suppliers table while any FK references
--     it. Those two columns stay as plain nullable integers (no FK) — their
--     historical values are untouched. This is required for the DROP TABLE.
--   * Drops the suppliers table + index.
--   * Removes all suppliers:* permissions and their role grants.
--
-- Replay-safe: every destructive statement is IF EXISTS / guarded.
--
-- DOWN: 042_drop_suppliers.down.sql (best-effort structural restore)
-- ============================================================================
BEGIN;

-- 1. Drop the PO supplier FK + index + column.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;
DROP INDEX IF EXISTS idx_po_supplier;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS supplier_id;

-- 2. Enforce NOT NULL DEFAULT '' on supplier_name — abort if any NULL remains.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'purchase_orders' AND column_name = 'supplier_name'
  ) THEN
    IF EXISTS (SELECT 1 FROM purchase_orders WHERE supplier_name IS NULL) THEN
      RAISE EXCEPTION 'Phase 3 abort: purchase_orders.supplier_name has NULL rows before NOT NULL lock. Restore from backup and re-run 041.';
    END IF;
    ALTER TABLE purchase_orders ALTER COLUMN supplier_name SET DEFAULT '';
    ALTER TABLE purchase_orders ALTER COLUMN supplier_name SET NOT NULL;
  END IF;
END $$;

-- 3. Drop remaining FKs that reference suppliers (required to drop the table).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_supplier_id_fkey;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_supplier_id_fkey;

-- 4. Drop the suppliers table itself (+ its index).
DROP INDEX IF EXISTS idx_suppliers_is_active;
DROP TABLE IF EXISTS suppliers;

-- 5. Remove suppliers:* permissions and all role grants on them.
DELETE FROM role_permissions
 WHERE permission_id IN (SELECT id FROM permissions WHERE code LIKE 'suppliers:%');

DELETE FROM permissions WHERE code LIKE 'suppliers:%';

-- 6. Record the drop in the migration ledger.
DO $$
DECLARE
  v_perm_codes int;
  v_grant_rows int;
BEGIN
  SELECT count(*) INTO v_grant_rows FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.code LIKE 'suppliers:%';
  SELECT count(*) INTO v_perm_codes FROM permissions WHERE code LIKE 'suppliers:%';

  INSERT INTO _migration_notes (note_key, payload)
  SELECT 'phase3_drop_suppliers',
         jsonb_build_object(
           'supplier_permission_codes_remaining', v_perm_codes,
           'supplier_grant_rows_remaining',       v_grant_rows,
           'dropped_tables',                      'suppliers',
           'dropped_fks',                         'purchase_orders_supplier_id_fkey, transactions_supplier_id_fkey, batches_supplier_id_fkey',
           'dropped_po_column',                   'purchase_orders.supplier_id'
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_notes WHERE note_key = 'phase3_drop_suppliers'
  );
END $$;

COMMIT;