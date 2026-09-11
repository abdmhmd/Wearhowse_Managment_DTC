-- ============================================================================
-- 036_project_pending_closure.sql (UP)
-- [NP1] Project closure workflow: report, pending_closure state, confirmation
-- ============================================================================
BEGIN;

-- 1. Add pending_closure value to project_status enum if not present
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'pending_closure';

-- 2. Add closure tracking columns
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS closure_initiated_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS closure_initiated_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.closure_initiated_by IS '[NP1] User who initiated project closure.';
COMMENT ON COLUMN projects.closure_initiated_at IS '[NP1] Timestamp when closure was initiated.';

COMMIT;
