-- ============================================================================
-- 042_drop_suppliers.down.sql  (DOWN)
-- Best-effort structural restore. Restores:
--   * the suppliers table (001 schema) — rows are NOT restored;
--   * the suppliers is_active index and updated_at trigger;
--   * purchase_orders.supplier_id (nullable integer, NO FK per spec);
--   * the transactions/batches supplier FKs that 042 had to drop in order to
--     drop the table (columns still exist as plain integers);
--   * the suppliers:* permission CODES (role grants are NOT restored).
-- Also relaxes purchase_orders.supplier_name back to nullable/no default so
-- the subsequent 041 down can remove the column cleanly.
--
-- Documented limitation: original supplier ROWS and role->permission GRANTS
-- are NOT restored. Restoring rows requires the pre-remediation backup:
--   psql "$DATABASE_URL" -f backups/pre-remediation_<stamp>.sql
-- ============================================================================
BEGIN;

-- 1. Recreate the suppliers table (original 001 schema, empty).
CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL PRIMARY KEY,
    name_ar    VARCHAR(255) NOT NULL,
    name_en    VARCHAR(255),
    phone      VARCHAR(50),
    email      VARCHAR(255),
    address    TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Recreate purchase_orders.supplier_id (nullable, no FK initially).
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);

-- 3. Relax supplier_name back to the 041 state (nullable, no default).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'purchase_orders' AND column_name = 'supplier_name'
  ) THEN
    ALTER TABLE purchase_orders ALTER COLUMN supplier_name DROP DEFAULT;
    ALTER TABLE purchase_orders ALTER COLUMN supplier_name DROP NOT NULL;
  END IF;
END $$;

-- 4. Re-add the FKs 042 dropped (guarded; the table is empty so this is safe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_supplier_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'transactions' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batches_supplier_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'batches' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Re-seed the suppliers permission codes (grants NOT restored).
INSERT INTO permissions (code, resource, action, description) VALUES
  ('suppliers:view',   'suppliers', 'view',   'View suppliers'),
  ('suppliers:create', 'suppliers', 'create', 'Create suppliers'),
  ('suppliers:update', 'suppliers', 'update', 'Update suppliers'),
  ('suppliers:delete', 'suppliers', 'delete', 'Delete suppliers')
ON CONFLICT (code) DO NOTHING;

-- 6. Remove the ledger note so the up migration can write it again.
DELETE FROM _migration_notes WHERE note_key = 'phase3_drop_suppliers';

COMMIT;