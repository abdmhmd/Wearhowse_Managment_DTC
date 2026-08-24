-- ============================================================================
-- 033_purchase_orders.sql  (UP)
-- Purchase Order + Stock Allocation feature.
--
-- Supply-side procurement workflow:
--   Supplier -> PO -> Approval -> Partial/Full Receiving (RV) into an active
--   MAIN warehouse -> Allocation reservation to a NON-MAIN department
--   warehouse -> Partial/Full Transfer (TRF) -> Department stock.
--
-- Design invariants (enforced by CHECKs, triggers and the service layer):
--   * item_warehouse_stock.current_balance stays the ONLY physical stock
--     store; allocations are a pure overlay/reservation layer.
--   * received <= ordered, allocated <= received, transferred <= allocated.
--   * A PO always receives into an ACTIVE MAIN warehouse (trigger).
--   * An allocation destination is always an ACTIVE NON-MAIN warehouse that
--     belongs to a department (trigger); the source is the PO main warehouse.
--   * transactions.purchase_order_id links the generated RV/TRF vouchers back
--     to their purchase order (nullable — existing transactions untouched).
--
-- Permissions: purchase-orders:* granted to system_admin (all) and to
-- warehouse_manager (scope enforced per-assignment at the service layer).
-- department_manager / supervisor receive NO purchase order permissions.
--
-- Dependencies: 001..032 (suppliers, warehouses.is_main/department_id,
-- roles/permissions/user_warehouses from 017, transaction engine).
-- Run inside a single transaction; rolled back atomically on any failure.
-- DOWN: 033_purchase_orders.down.sql
-- ============================================================================
BEGIN;

-- 1. Enum types ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_order_status') THEN
    CREATE TYPE purchase_order_status AS ENUM (
      'draft',               -- created, editable, not yet approved
      'approved',            -- approved, awaiting receiving
      'partially_received',  -- some quantities received
      'received',            -- fully received
      'closed',              -- all allocations transferred/cancelled
      'cancelled'            -- terminal cancelled state
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allocation_status') THEN
    CREATE TYPE allocation_status AS ENUM (
      'allocated',             -- reserved, nothing moved yet
      'partially_transferred', -- part of the reservation moved
      'transferred',           -- fully moved
      'cancelled'              -- reservation released
    );
  END IF;
END $$;

-- 2. Number sequence (PO-{year}-{seq}) ---------------------------------------
CREATE SEQUENCE IF NOT EXISTS po_no_seq START 1;

-- 3. purchase_orders ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
    id               SERIAL PRIMARY KEY,
    po_number        VARCHAR(100) UNIQUE NOT NULL,
    supplier_id      INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    status           purchase_order_status NOT NULL DEFAULT 'draft',
    order_date       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_date    DATE,
    notes            TEXT,
    created_by       INTEGER NOT NULL REFERENCES users(id),
    approved_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at      TIMESTAMPTZ,
    cancelled_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    cancelled_at     TIMESTAMPTZ,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_po_supplier     ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_warehouse    ON purchase_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_po_department   ON purchase_orders(department_id);
CREATE INDEX IF NOT EXISTS idx_po_status       ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created_by   ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_po_wh_status    ON purchase_orders(warehouse_id, status);

CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Invariant: a PO can only ever point its RECEIVING side at an active MAIN
-- warehouse. DB-level guarantee independent of any service logic.
CREATE OR REPLACE FUNCTION enforce_po_main_warehouse() RETURNS trigger AS $$
BEGIN
  IF NEW.warehouse_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.id = NEW.warehouse_id AND w.is_main = true AND w.is_active = true
  ) THEN
    RAISE EXCEPTION 'Purchase orders must receive into an active MAIN warehouse (warehouse_id=%)', NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_main_warehouse ON purchase_orders;
CREATE TRIGGER trg_po_main_warehouse
  BEFORE INSERT OR UPDATE OF warehouse_id ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_po_main_warehouse();

-- 4. purchase_order_details ---------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order_details (
    id                   SERIAL PRIMARY KEY,
    po_id                INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id              INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity_ordered     DECIMAL(12, 4) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received    DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    quantity_allocated   DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (quantity_allocated >= 0),
    quantity_transferred DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (quantity_transferred >= 0),
    unit_code            VARCHAR(50) NOT NULL REFERENCES units(code),
    unit_price           DECIMAL(12, 4) NOT NULL DEFAULT 0,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_po_detail_item UNIQUE (po_id, item_id),
    CONSTRAINT ck_pod_received_le_ordered  CHECK (quantity_received <= quantity_ordered),
    CONSTRAINT ck_pod_allocated_le_received CHECK (quantity_allocated <= quantity_received),
    CONSTRAINT ck_pod_transferred_le_alloc CHECK (quantity_transferred <= quantity_allocated)
);

CREATE INDEX IF NOT EXISTS idx_pod_po   ON purchase_order_details(po_id);
CREATE INDEX IF NOT EXISTS idx_pod_item ON purchase_order_details(item_id);

CREATE TRIGGER trg_pod_updated_at BEFORE UPDATE ON purchase_order_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. purchase_order_allocations ----------------------------------------------
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
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_poa_transferred_le_allocated CHECK (quantity_transferred <= quantity_allocated)
);

CREATE INDEX IF NOT EXISTS idx_poa_detail   ON purchase_order_allocations(po_detail_id);
CREATE INDEX IF NOT EXISTS idx_poa_po       ON purchase_order_allocations(po_id);
CREATE INDEX IF NOT EXISTS idx_poa_source   ON purchase_order_allocations(source_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_poa_dest     ON purchase_order_allocations(dest_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_poa_status   ON purchase_order_allocations(status);
CREATE INDEX IF NOT EXISTS idx_poa_dest_st  ON purchase_order_allocations(dest_warehouse_id, status);

CREATE TRIGGER trg_poa_updated_at BEFORE UPDATE ON purchase_order_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Invariants: allocation source must be the (active MAIN) PO receiving
-- warehouse; destination must be an active NON-Main department warehouse.
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

-- 6. Transactions integration -------------------------------------------------
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'transactions'::regclass
      AND c.contype = 'f'
      AND a.attname = 'purchase_order_id'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_purchase_order_id
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_purchase_order ON transactions(purchase_order_id);

-- 7. Permissions ---------------------------------------------------------------
INSERT INTO permissions (code, resource, action, description) VALUES
  ('purchase-orders:view',     'purchase-orders', 'view',     'View purchase orders'),
  ('purchase-orders:create',   'purchase-orders', 'create',   'Create purchase orders'),
  ('purchase-orders:update',   'purchase-orders', 'update',   'Update draft purchase orders'),
  ('purchase-orders:approve',  'purchase-orders', 'approve',  'Approve purchase orders'),
  ('purchase-orders:cancel',   'purchase-orders', 'cancel',   'Cancel purchase orders'),
  ('purchase-orders:receive',  'purchase-orders', 'receive',  'Receive purchase order stock'),
  ('purchase-orders:allocate', 'purchase-orders', 'allocate', 'Allocate received stock to warehouses'),
  ('purchase-orders:transfer', 'purchase-orders', 'transfer', 'Transfer allocated stock between warehouses')
ON CONFLICT (code) DO NOTHING;

-- Grants: system_admin gets everything; warehouse_manager operates within its
-- assigned-warehouse scope (enforced per request at the service layer).
-- department_manager / supervisor intentionally receive NO grants.
WITH matrix(role_code, perm) AS (VALUES
  ('system_admin',      'purchase-orders:view'),
  ('system_admin',      'purchase-orders:create'),
  ('system_admin',      'purchase-orders:update'),
  ('system_admin',      'purchase-orders:approve'),
  ('system_admin',      'purchase-orders:cancel'),
  ('system_admin',      'purchase-orders:receive'),
  ('system_admin',      'purchase-orders:allocate'),
  ('system_admin',      'purchase-orders:transfer'),
  ('warehouse_manager', 'purchase-orders:view'),
  ('warehouse_manager', 'purchase-orders:create'),
  ('warehouse_manager', 'purchase-orders:update'),
  ('warehouse_manager', 'purchase-orders:approve'),
  ('warehouse_manager', 'purchase-orders:cancel'),
  ('warehouse_manager', 'purchase-orders:receive'),
  ('warehouse_manager', 'purchase-orders:allocate'),
  ('warehouse_manager', 'purchase-orders:transfer')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.role_code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
