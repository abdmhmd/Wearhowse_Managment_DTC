-- Migration 005: Stock Balance Per Warehouse
-- Creates a dedicated table to track stock balance per item per warehouse
-- This replaces the single current_balance on items for multi-warehouse tracking

CREATE TABLE IF NOT EXISTS item_warehouse_stock (
    id               SERIAL PRIMARY KEY,
    item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    current_balance  DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 CHECK (current_balance >= 0),
    min_stock_level  DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    max_stock_level  DECIMAL(12, 4) NOT NULL DEFAULT 999999.9999,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_item_warehouse UNIQUE (item_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_iws_item      ON item_warehouse_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_iws_warehouse ON item_warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_iws_low_stock ON item_warehouse_stock(current_balance, min_stock_level);

-- Auto-update updated_at trigger
CREATE TRIGGER trg_iws_updated_at
BEFORE UPDATE ON item_warehouse_stock
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing data: create stock records from current items
-- Each item gets a stock record in its assigned warehouse with the current balance
INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance, min_stock_level, max_stock_level)
SELECT
    id,
    warehouse_id,
    COALESCE(current_balance, 0),
    COALESCE(min_stock_level, 0),
    COALESCE(max_stock_level, 999999.9999)
FROM items
ON CONFLICT (item_id, warehouse_id) DO NOTHING;

COMMENT ON TABLE item_warehouse_stock IS 'Tracks real-time stock balance per item per warehouse. Source of truth for inventory levels.';
COMMENT ON COLUMN item_warehouse_stock.current_balance IS 'Live balance. Updated atomically within transaction approval.';
