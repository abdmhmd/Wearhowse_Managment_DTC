-- ============================================================================
-- 046_drop_allocations.down.sql  (DOWN)
-- Recreates the allocation model removed by 046_drop_allocations.sql:
-- enum -> table -> indexes -> trigger -> guard function -> note cleanup.
--
-- IMPORTANT / PARTIAL REVERSAL:
--   The `purchase-orders:allocate` and `purchase-orders:transfer` permission
--   CODES and their role grants are intentionally NOT restored here. Phase 5
--   removed those capabilities from the application; re-granting them would
--   expose routes/UI that no longer exist. Restore manually if you truly need
--   the pre-Phase-5 behaviour.
--
-- Replay-safe: enum/table/indexes/triggers use IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================================
BEGIN;

-- 1. Enum type ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allocation_status') THEN
    CREATE TYPE allocation_status AS ENUM (
      'allocated',
      'partially_transferred',
      'transferred',
      'cancelled'
    );
  END IF;
END $$;

-- 2. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order_allocations (
    id                      SERIAL PRIMARY KEY,
    po_detail_id            INTEGER NOT NULL REFERENCES purchase_order_details(id) ON DELETE RESTRICT,
    po_id                   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    source_warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    dest_warehouse_id       INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    quantity_allocated      DECIMAL(12, 4) NOT NULL CHECK (quantity_allocated > 0),
    quantity_transferred    DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (quantity_transferred >= 0),
    status                  allocation_status NOT NULL DEFAULT 'allocated',
    allocated_by            INTEGER NOT NULL REFERENCES users(id),
    allocated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transferred_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    transferred_at          TIMESTAMPTZ,
    transfer_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    receive_transaction_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    transfer_confirmed_by   INTEGER REFERENCES users(id),
    transfer_confirmed_at   TIMESTAMPTZ,
    pending_transaction_id  INTEGER REFERENCES transactions(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_poa_transferred_le_allocated CHECK (quantity_transferred <= quantity_allocated)
);

-- 3. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_poa_detail   ON purchase_order_allocations(po_detail_id);
CREATE INDEX IF NOT EXISTS idx_poa_po       ON purchase_order_allocations(po_id);
CREATE INDEX IF NOT EXISTS idx_poa_source   ON purchase_order_allocations(source_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_poa_dest     ON purchase_order_allocations(dest_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_poa_status   ON purchase_order_allocations(status);
CREATE INDEX IF NOT EXISTS idx_poa_dest_st  ON purchase_order_allocations(dest_warehouse_id, status);

-- 4. Triggers -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_poa_updated_at ON purchase_order_allocations;
CREATE TRIGGER trg_poa_updated_at BEFORE UPDATE ON purchase_order_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Warehouse guard function + trigger ---------------------------------------
CREATE OR REPLACE FUNCTION enforce_po_allocation_warehouses() RETURNS trigger AS $$
DECLARE
  v_po_warehouse INTEGER;
BEGIN
  SELECT warehouse_id INTO v_po_warehouse FROM purchase_orders WHERE id = NEW.po_id;

  IF NEW.source_warehouse_id IS DISTINCT FROM v_po_warehouse THEN
    RAISE EXCEPTION 'Allocation source must be the PO receiving warehouse (%)', v_po_warehouse;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM warehouses w
     WHERE w.id = NEW.dest_warehouse_id AND w.is_active = true AND w.is_main = false AND w.department_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Allocation destination must be an active non-main department warehouse (%)', NEW.dest_warehouse_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_poa_warehouses ON purchase_order_allocations;
CREATE TRIGGER trg_poa_warehouses
  BEFORE INSERT OR UPDATE OF po_id, source_warehouse_id, dest_warehouse_id ON purchase_order_allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_po_allocation_warehouses();

-- 6. Ledger -------------------------------------------------------------------
DELETE FROM _migration_notes WHERE note_key = 'phase5_drop_allocations';

COMMIT;
