-- Migration 010: Physical Inventory / Cycle Count (الجرد الدوري)
-- Enables formal stock-taking sessions with variance calculation and auto ADJ vouchers

CREATE TYPE inventory_session_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS inventory_sessions (
    id             SERIAL PRIMARY KEY,
    session_no     VARCHAR(100) UNIQUE NOT NULL,
    warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    status         inventory_session_status NOT NULL DEFAULT 'open',
    notes          TEXT,
    started_by     INTEGER REFERENCES users(id),
    started_at     TIMESTAMP,
    completed_by   INTEGER REFERENCES users(id),
    completed_at   TIMESTAMP,
    adj_transaction_id INTEGER REFERENCES transactions(id),  -- ADJ voucher auto-created on close
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_counts (
    id             SERIAL PRIMARY KEY,
    session_id     INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    item_id        INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    system_qty     DECIMAL(12, 4) NOT NULL,              -- Balance at time of session open
    counted_qty    DECIMAL(12, 4),                       -- Physically counted amount (NULL = not yet counted)
    variance       DECIMAL(12, 4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
    unit_code      VARCHAR(50) NOT NULL REFERENCES units(code),
    counted_by     INTEGER REFERENCES users(id),
    counted_at     TIMESTAMP,
    notes          TEXT,
    CONSTRAINT uq_session_item UNIQUE (session_id, item_id)
);

CREATE SEQUENCE IF NOT EXISTS inventory_session_no_seq START 1;

CREATE INDEX IF NOT EXISTS idx_inv_sessions_warehouse ON inventory_sessions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_status    ON inventory_sessions(status);
CREATE INDEX IF NOT EXISTS idx_inv_counts_session     ON inventory_counts(session_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_item        ON inventory_counts(item_id);

CREATE TRIGGER trg_inv_sessions_updated_at
BEFORE UPDATE ON inventory_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inventory_sessions IS 'Physical inventory counting sessions per warehouse. Closing a session auto-generates ADJ transaction for variances.';
COMMENT ON COLUMN inventory_counts.variance IS 'Auto-computed: counted_qty - system_qty. Positive = surplus, Negative = deficit.';
