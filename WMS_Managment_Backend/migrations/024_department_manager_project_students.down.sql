-- ============================================================================
-- 024_department_manager_project_students.down.sql
-- Revokes the department_manager projects:update permission (matching 019,
-- which removed projects:update from department_manager).
-- ============================================================================
BEGIN;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'department_manager'
  AND p.code = 'projects:update';

COMMIT;
