-- ============================================================================
-- 036_project_pending_closure.down.sql (DOWN)
-- ============================================================================
BEGIN;

ALTER TABLE projects
  DROP COLUMN IF EXISTS closure_initiated_at,
  DROP COLUMN IF EXISTS closure_initiated_by;

COMMIT;
