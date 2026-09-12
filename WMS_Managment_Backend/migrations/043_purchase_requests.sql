-- ============================================================================
-- 043_purchase_requests.sql  (UP)
-- Phase 4.1 / Purchase Request module.
--
-- Demand-side procurement workflow:
--   Sub-WH manager (creates) -> dept_approved (department_manager approves)
--   -> admin_approved (system_admin approves) -> AUTO-PO created
--   -> Part of the existing Phase 2/3 Purchase Order flow.
--
-- Design invariants (enforced by CHECKs, FKs and the service layer):
--   * status machine: pending -> dept_approved (approve-dept)
--                      pending | dept_approved -> rejected (reject-dept/reject-admin)
--                      dept_approved -> admin_approved + auto-PO (approve-admin)
--                      pending -> cancelled (cancel, creator-only)
--   * Every purchase request has >= 1 line item with quantity > 0.
--   * The request warehouse is the department's ACTIVE MAIN warehouse so the
--     auto-created PO passes the existing enforce_po_main_warehouse trigger.
--   * Resolution: the link between a request and its auto-PO lives ONLY on
--     purchase_requests.purchase_order_id (UNIQUE) — a purchase_request_id
--     column is deliberately NOT added to purchase_orders, avoiding a
--     circular dependency between the two tables.
--   * department_id / warehouse_id / created_by are enforced by FKs so a
--     request can never be orphaned.
--
-- Dependencies: 001..042 (departments, warehouses, users, items, units,
-- purchase_orders from 033, roles/permissions from 017, _migration_notes
-- from 038).
-- Run inside a single transaction; rolled back atomically on any failure.
-- DOWN: 043_purchase_requests.down.sql
-- ============================================================================
BEGIN;

-- 1. Enum type ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_request_status') THEN
    CREATE TYPE purchase_request_status AS ENUM (
      'pending',        -- created, awaiting department approval
      'dept_approved',  -- approved by the department manager
      'admin_approved', -- approved by the system admin (auto-PO created)
      'rejected',       -- terminal rejected state (with reason)
      'cancelled'       -- terminal cancelled state (creator only, pending only)
    );
  END IF;
END $$;

-- 2. Number sequence (PR-{year}-{seq}) ---------------------------------------
CREATE SEQUENCE IF NOT EXISTS pr_no_seq START 1;

-- 3. purchase_requests -------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_requests (
    id                  SERIAL PRIMARY KEY,
    request_no          VARCHAR(100) UNIQUE NOT NULL,
    department_id       INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    warehouse_id        INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    status              purchase_request_status NOT NULL DEFAULT 'pending',
    notes               TEXT,
    dept_approved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dept_approved_at    TIMESTAMPTZ,
    admin_approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_approved_at   TIMESTAMPTZ,
    rejected_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason    TEXT,
    rejected_at         TIMESTAMPTZ,
    cancelled_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    cancelled_at        TIMESTAMPTZ,
    purchase_order_id   INTEGER UNIQUE REFERENCES purchase_orders(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pr_status    ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_created_by ON purchase_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_pr_department ON purchase_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_pr_warehouse  ON purchase_requests(warehouse_id);

CREATE TRIGGER trg_purchase_requests_updated_at BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. purchase_request_items --------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_request_items (
    id                    SERIAL PRIMARY KEY,
    purchase_request_id   INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    item_id               INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity              NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
    unit_code             VARCHAR(50) NOT NULL REFERENCES units(code),
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pri_request_item UNIQUE (purchase_request_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_pri_request ON purchase_request_items(purchase_request_id);

-- 5. Migration ledger --------------------------------------------------------
DO $$
BEGIN
  INSERT INTO _migration_notes (note_key, payload)
  SELECT 'phase4_purchase_requests_created',
         jsonb_build_object(
           'enum_values',        ARRAY['pending','dept_approved','admin_approved','rejected','cancelled'],
           'tables_created',     ARRAY['purchase_requests','purchase_request_items'],
           'sequence_created',   'pr_no_seq',
           'auto_po_resolution', 'purchase_order_id on purchase_requests side only (no circular FK)',
           'warehouse_rule',     'request warehouse must be the department active MAIN warehouse (feeds enforce_po_main_warehouse)'
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_notes WHERE note_key = 'phase4_purchase_requests_created'
  );
END $$;

COMMIT;