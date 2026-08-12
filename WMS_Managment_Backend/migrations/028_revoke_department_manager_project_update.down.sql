-- ============================================================================
-- 028_revoke_department_manager_project_update.down.sql
-- Restores the department_manager `projects:update` grant (migration 024).
-- ============================================================================
BEGIN;

WITH matrix(code, perm) AS (VALUES
  ('department_manager', 'projects:update')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
