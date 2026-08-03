-- ============================================================================
-- 015_add_location_tracking.sql  (UP)
-- Adds a `locations` table (rack/shelf/bin) and links it to inventory
-- (item_warehouse_stock.location_id) so stock can be tracked to a physical
-- position inside a warehouse.
--
-- Dependencies: 001_initial_schema.sql (or schema.sql + 002..014)
-- Run inside a single transaction; rolled back atomically on any failure.
-- DOWN: 015_add_location_tracking.down.sql
-- ============================================================================
BEGIN;

-- 1. Locations table: physical position inside a warehouse.
CREATE TABLE IF NOT EXISTS locations (
    id           SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    rack         VARCHAR(50) NOT NULL,
    shelf        VARCHAR(50) NOT NULL,
    bin          VARCHAR(50) NOT NULL,
    barcode      VARCHAR(100) UNIQUE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_location UNIQUE (warehouse_id, rack, shelf, bin)
);

CREATE INDEX IF NOT EXISTS idx_locations_warehouse            ON locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_locations_warehouse_rack_shelf ON locations(warehouse_id, rack, shelf);
CREATE INDEX IF NOT EXISTS idx_locations_is_active            ON locations(is_active);
CREATE INDEX IF NOT EXISTS idx_locations_barcode              ON locations(barcode);

-- 2. Link inventory rows to an optional location.
--    ADD COLUMN IF NOT EXISTS + guarded FK keeps this idempotent.
ALTER TABLE item_warehouse_stock ADD COLUMN IF NOT EXISTS location_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'item_warehouse_stock'::regclass
      AND c.contype = 'f'
      AND a.attname = 'location_id'
  ) THEN
    ALTER TABLE item_warehouse_stock
      ADD CONSTRAINT fk_iws_location
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_iws_location ON item_warehouse_stock(location_id);

-- 3. updated_at trigger for the new table (guarded for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_locations_updated_at') THEN
    CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMIT;
