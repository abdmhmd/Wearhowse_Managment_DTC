-- ============================================================================
-- 023_project_management_workflow.down.sql  (DOWN)
-- Reverts the graduation-project workflow added in 023:
--   * revokes project-management + custody-return grants from warehouse_manager
--   * drops project_students
--   * drops the new projects metadata columns (incl. warehouse_id)
--   * drops the new custodies columns (expected_return_at, condition)
--
-- ENUM LIMITATION: the added enum values ('cancelled' on project_status,
-- 'damaged'/'lost' on custody_status) and the custody_condition type cannot be
-- removed without recreating the enum types (PostgreSQL does not support
-- DROP VALUE). Rows created with those values would block a full rollback, so
-- the enum extensions are intentionally left in place.
-- ============================================================================
BEGIN;

-- 1. Revoke warehouse_manager project-management grants ------------------------
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'warehouse_manager'
  AND p.code IN ('projects:create', 'projects:update', 'projects:close', 'custodies:return');

-- 2. Drop project_students -----------------------------------------------------
DROP TABLE IF EXISTS project_students;

-- 3. Drop new custodies columns ------------------------------------------------
ALTER TABLE custodies
  DROP COLUMN IF EXISTS expected_return_at,
  DROP COLUMN IF EXISTS condition;

DROP TYPE IF EXISTS custody_condition;

-- 4. Drop new projects columns -------------------------------------------------
ALTER TABLE projects
  DROP COLUMN IF EXISTS warehouse_id,
  DROP COLUMN IF EXISTS academic_year,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS expected_completion_date;

DROP INDEX IF EXISTS idx_custodies_warehouse_status;

COMMIT;
