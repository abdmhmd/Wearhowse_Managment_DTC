-- Migration 007: Material Requests (طلبات الصرف)
-- Enables department managers to submit issue requests before a warehouse issues an LN voucher

CREATE SEQUENCE IF NOT EXISTS request_no_seq START 1;

CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'issued', 'cancelled');
CREATE TYPE request_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Main request header
CREATE TABLE IF NOT EXISTS material_requests (
    id               SERIAL PRIMARY KEY,
    request_no       VARCHAR(100) UNIQUE NOT NULL,
    department_id    INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    requested_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status           request_status NOT NULL DEFAULT 'pending',
    priority         request_priority NOT NULL DEFAULT 'normal',
    needed_by        DATE,
    notes            TEXT,
    rejection_reason TEXT,
    approved_by      INTEGER REFERENCES users(id),
    approved_at      TIMESTAMP,
    issued_by        INTEGER REFERENCES users(id),
    issued_at        TIMESTAMP,
    transaction_id   INTEGER REFERENCES transactions(id),  -- The LN voucher created from this request
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Request line items
CREATE TABLE IF NOT EXISTS material_request_details (
    id           SERIAL PRIMARY KEY,
    request_id   INTEGER NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity     DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
    unit_code    VARCHAR(50) NOT NULL REFERENCES units(code),
    notes        TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Also link transactions back to requests (for LN vouchers generated from requests)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES material_requests(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mr_department  ON material_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_mr_warehouse   ON material_requests(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_mr_status      ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_mr_requested_by ON material_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_mrd_request    ON material_request_details(request_id);
CREATE INDEX IF NOT EXISTS idx_mrd_item       ON material_request_details(item_id);

-- Trigger for updated_at
CREATE TRIGGER trg_mr_updated_at
BEFORE UPDATE ON material_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE material_requests IS 'Issue requests submitted by department managers. Must be approved before an LN voucher is issued.';
COMMENT ON COLUMN material_requests.transaction_id IS 'The LN transaction created when this request is issued by the warehouse.';
