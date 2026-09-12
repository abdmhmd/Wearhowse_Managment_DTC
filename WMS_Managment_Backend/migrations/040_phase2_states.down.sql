-- Down for 040: restore the pre-Phase-2 enums and drop the new columns.
-- Enum values are removed by recasting the dependent columns through text,
-- recreating the types without the new values, then recasting back.

BEGIN;

-- ── Revert request_status (drop wm_rejected) ────────────────────────────

ALTER TABLE material_requests
  ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
ALTER TABLE material_requests
  ALTER COLUMN status DROP DEFAULT;

DO $$
BEGIN
  DROP TYPE IF EXISTS request_status CASCADE;
  CREATE TYPE request_status AS ENUM (
    'pending',
    'dept_approved',
    'wm_approved',
    'forwarded',
    'admin_approved',
    'admin_rejected',
    'issued',
    'cancelled'
  );
END $$;

ALTER TABLE material_requests
  ALTER COLUMN status TYPE request_status USING status::request_status;
ALTER TABLE material_requests
  ALTER COLUMN status SET DEFAULT 'pending'::request_status;

-- ── Revert allocation_status (drop pending_confirmation) ────────────────

ALTER TABLE purchase_order_allocations
  ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
ALTER TABLE purchase_order_allocations
  ALTER COLUMN status DROP DEFAULT;

DO $$
BEGIN
  DROP TYPE IF EXISTS allocation_status CASCADE;
  CREATE TYPE allocation_status AS ENUM (
    'allocated',
    'partially_transferred',
    'transferred',
    'cancelled'
  );
END $$;

ALTER TABLE purchase_order_allocations
  ALTER COLUMN status TYPE allocation_status USING status::allocation_status;
ALTER TABLE purchase_order_allocations
  ALTER COLUMN status SET DEFAULT 'allocated'::allocation_status;

-- ── Drop the new two-party columns ──────────────────────────────────────

ALTER TABLE purchase_order_allocations
  DROP COLUMN IF EXISTS creation_confirmed_by;
ALTER TABLE purchase_order_allocations
  DROP COLUMN IF EXISTS creation_confirmed_at;

COMMIT;