-- Migration 009: Alerts System (نظام التنبيهات)
-- Stores system-generated alerts for low stock, expiry warnings, and pending requests

CREATE TYPE alert_type   AS ENUM ('low_stock', 'expiry_warning', 'overstock', 'pending_request');
CREATE TYPE alert_status AS ENUM ('active', 'acknowledged', 'resolved');

CREATE TABLE IF NOT EXISTS alerts (
    id               SERIAL PRIMARY KEY,
    type             alert_type NOT NULL,
    status           alert_status NOT NULL DEFAULT 'active',
    item_id          INTEGER REFERENCES items(id) ON DELETE CASCADE,
    warehouse_id     INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
    batch_id         INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    request_id       INTEGER REFERENCES material_requests(id) ON DELETE CASCADE,
    message_ar       TEXT NOT NULL,
    message_en       TEXT,
    acknowledged_by  INTEGER REFERENCES users(id),
    acknowledged_at  TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_status    ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_type      ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_item      ON alerts(item_id);
CREATE INDEX IF NOT EXISTS idx_alerts_warehouse ON alerts(warehouse_id);

-- PostgreSQL function to auto-generate low_stock alerts after balance update
CREATE OR REPLACE FUNCTION fn_check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- If new balance is at or below min_stock_level, create an alert (if not already active)
    IF NEW.current_balance <= NEW.min_stock_level AND NEW.min_stock_level > 0 THEN
        INSERT INTO alerts (type, item_id, warehouse_id, message_ar, message_en)
        SELECT
            'low_stock',
            NEW.item_id,
            NEW.warehouse_id,
            'وصل المخزون إلى الحد الأدنى أو دونه',
            'Stock reached minimum level or below'
        WHERE NOT EXISTS (
            SELECT 1 FROM alerts
            WHERE type = 'low_stock'
              AND item_id = NEW.item_id
              AND warehouse_id = NEW.warehouse_id
              AND status = 'active'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_low_stock_alert
AFTER UPDATE ON item_warehouse_stock
FOR EACH ROW EXECUTE FUNCTION fn_check_low_stock();

COMMENT ON TABLE alerts IS 'System-generated and auto-triggered alerts for stock levels, expiry, and workflow events.';
