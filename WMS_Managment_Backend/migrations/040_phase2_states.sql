-- 040: Phase 2 workflow states + columns
--
-- Part 1 – request_status gains `wm_rejected`.
--          D13: a sub-warehouse manager rejects a PENDING request before it
--          is approved — the request lands in `wm_rejected` and can never be
--          issued. Previously the only rejection destination was
--          `admin_rejected` (from forwarded), which is now unreachable.
--
-- Part 2 – allocation_status gains `pending_confirmation`.
--          D9: once a TRF physically moves stock, the allocation enters
--          `pending_confirmation` and requires a DIFFERENT user to confirm the
--          transfer before it is finalised as `transferred`/
--          `partially_transferred`. Two-party confirmation for receive is
--          enforced in the service layer (no new column needed on purchase_orders).
--
-- Part 3 – purchase_order_allocations tracks the new two-party columns:
--          creation_confirmed_by / creation_confirmed_at are added; the
--          existing transfer_confirmed_by/at are reused for the transfer leg.
--          material_requests.rejected_by / rejection_reason ALREADY exist, so
--          the ADD COLUMN IF NOT EXISTS clauses are no-ops for them.

BEGIN;

-- ── Part 1: rejection status destination ────────────────────────────────

ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'wm_rejected';

-- ── Part 2: allocation confirmation state ───────────────────────────────

ALTER TYPE allocation_status ADD VALUE IF NOT EXISTS 'pending_confirmation';

-- ── Part 3: two-party columns ───────────────────────────────────────────

ALTER TABLE purchase_order_allocations
  ADD COLUMN IF NOT EXISTS creation_confirmed_by INTEGER REFERENCES users(id);
ALTER TABLE purchase_order_allocations
  ADD COLUMN IF NOT EXISTS creation_confirmed_at TIMESTAMPTZ;

-- material_requests.rejected_by / rejection_reason already exist (from 038's
-- admin-rejection path), reused as-is for wm_rejected.

COMMIT;