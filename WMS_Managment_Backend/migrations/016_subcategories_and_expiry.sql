-- ============================================================================
-- 016_subcategories_and_expiry.sql  (UP)
-- Adds a dedicated `subcategories` entity (one level under a category),
-- links items to an optional subcategory, and adds expiry-date tracking
-- columns to transaction lines so receiving vouchers can record
-- production / expiry dates per line (used for batch creation).
--
-- Dependencies: 001_initial_schema.sql + 002..015
-- Run inside a single transaction; rolled back atomically on any failure.
-- DOWN: 016_subcategories_and_expiry.down.sql
-- ============================================================================
BEGIN;

-- 1. Subcategories table: one level below a category.
CREATE TABLE IF NOT EXISTS subcategories (
    id            SERIAL PRIMARY KEY,
    category_code VARCHAR(50) NOT NULL REFERENCES categories(code) ON DELETE CASCADE,
    code          VARCHAR(50) NOT NULL,
    name_ar       VARCHAR(255) NOT NULL,
    name_en       VARCHAR(255),
    description   TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subcategory_code UNIQUE (category_code, code)
);

CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_code);
CREATE INDEX IF NOT EXISTS idx_subcategories_is_active ON subcategories(is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_subcategories_updated_at') THEN
    CREATE TRIGGER trg_subcategories_updated_at
    BEFORE UPDATE ON subcategories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 2. Items reference an optional subcategory.
ALTER TABLE items ADD COLUMN IF NOT EXISTS subcategory_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'items'::regclass
      AND c.contype = 'f'
      AND a.attname = 'subcategory_id'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT fk_items_subcategory
      FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_subcategory ON items(subcategory_id);

-- 3. Expiry-date tracking on transaction lines (per-line production/expiry).
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS production_date DATE;
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS expiry_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- expiry_date may only be set when tracking is enabled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_td_expiry_requires_tracking' AND conrelid = 'transaction_details'::regclass
  ) THEN
    ALTER TABLE transaction_details
      ADD CONSTRAINT chk_td_expiry_requires_tracking
      CHECK (expiry_date IS NULL OR expiry_tracking_enabled);
  END IF;
END $$;

-- production_date must never be later than expiry_date.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_td_production_before_expiry' AND conrelid = 'transaction_details'::regclass
  ) THEN
    ALTER TABLE transaction_details
      ADD CONSTRAINT chk_td_production_before_expiry
      CHECK (production_date IS NULL OR expiry_date IS NULL OR production_date <= expiry_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_td_item_expiry ON transaction_details(item_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

-- 4. Consistency guard on the existing batches table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batches_production_before_expiry' AND conrelid = 'batches'::regclass
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_production_before_expiry
      CHECK (production_date IS NULL OR expiry_date IS NULL OR production_date <= expiry_date);
  END IF;
END $$;

COMMIT;
