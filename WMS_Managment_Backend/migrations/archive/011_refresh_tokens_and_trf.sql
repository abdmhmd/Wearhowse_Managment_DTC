-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Add to_warehouse_id to transactions (for TRF)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'to_warehouse_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN to_warehouse_id INTEGER REFERENCES warehouses(id);
  END IF;
END $$;

-- Add batch_number to transaction_details
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transaction_details' AND column_name = 'batch_number'
  ) THEN
    ALTER TABLE transaction_details ADD COLUMN batch_number VARCHAR(100);
  END IF;
END $$;

-- Add is_active to unit_conversions for soft delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unit_conversions' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE unit_conversions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unit_conversions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE unit_conversions ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unit_conversions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE unit_conversions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;
