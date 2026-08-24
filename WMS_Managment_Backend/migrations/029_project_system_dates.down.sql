-- ============================================================================
-- 029_project_system_dates.sql  (DOWN)
-- Reverts the system-managed lifecycle date column. Historical dates already
-- backfilled into start_date are kept (they are the creation dates).
-- ============================================================================
BEGIN;

ALTER TABLE projects DROP COLUMN IF EXISTS end_date;

COMMIT;
