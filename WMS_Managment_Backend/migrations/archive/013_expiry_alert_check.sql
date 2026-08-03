-- Migration 013: Ensure items.expiry_alert_days has the range check constraint.
-- Required for environments where migration 012 was applied before the CHECK
-- constraint was included. Idempotent and safe to run after 012.

ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_expiry_alert_days;
ALTER TABLE items ADD CONSTRAINT chk_items_expiry_alert_days
  CHECK (expiry_alert_days BETWEEN 1 AND 3650);

COMMENT ON COLUMN items.expiry_alert_days IS 'Days before expiry_date to trigger alert. Per-item override of the previous system-wide 30 days. Must be between 1 and 3650.';
