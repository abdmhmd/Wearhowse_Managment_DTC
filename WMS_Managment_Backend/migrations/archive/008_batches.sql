-- Migration 008: Batch / Lot Tracking (تتبع الدفعات والصلاحية)
-- Tracks individual batches per item per warehouse with expiry and production dates

CREATE TABLE IF NOT EXISTS batches (
    id               SERIAL PRIMARY KEY,
    item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    batch_number     VARCHAR(100) NOT NULL,
    production_date  DATE,
    expiry_date      DATE,
    quantity         DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 CHECK (quantity >= 0),
    unit_code        VARCHAR(50) NOT NULL REFERENCES units(code),
    supplier_id      INTEGER REFERENCES suppliers(id),
    transaction_id   INTEGER REFERENCES transactions(id),  -- RV that brought this batch in
    notes            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_batch UNIQUE (item_id, warehouse_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_item      ON batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_warehouse  ON batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry     ON batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_active     ON batches(is_active);

-- Trigger for updated_at
CREATE TRIGGER trg_batches_updated_at
BEFORE UPDATE ON batches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE batches IS 'Tracks inventory batches per item per warehouse. Enables FEFO (First Expired First Out) and expiry warnings.';
COMMENT ON COLUMN batches.expiry_date IS 'If set, alerts will be triggered when expiry_date is within the configured warning period.';
