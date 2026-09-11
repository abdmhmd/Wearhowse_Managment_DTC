-- ============================================================================
-- 029_project_system_dates.sql  (UP)
-- Lifecycle dates are SYSTEM-MANAGED — never entered by the user:
--   * start_date = server date when the project is created (CURRENT_DATE)
--   * end_date   = server date when the project is completed (closed)
-- The client may not supply either value; the API layer strips them.
--
-- No existing data is destroyed: closed projects receive their completion
-- date from the recorded close timestamp, and NULL start dates align with
-- their creation date.
--
-- DOWN: 029_project_system_dates.down.sql
-- ============================================================================
BEGIN;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;

-- Backfill historical dates so completed projects keep their completion date
-- and every project has a start date consistent with the new rule.
UPDATE projects
SET end_date = closed_at::date
WHERE status::text = 'closed' AND end_date IS NULL AND closed_at IS NOT NULL;

UPDATE projects
SET start_date = created_at::date
WHERE start_date IS NULL AND created_at IS NOT NULL;

COMMIT;
