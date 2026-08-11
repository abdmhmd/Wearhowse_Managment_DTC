-- ============================================================================
-- 024_department_manager_project_students.sql  (UP)
-- Department managers may add/edit the student roster on projects in their
-- own department. They remain view-only for everything else on projects
-- (no create/close/cancel/delete; warehouse moves are rejected in the service).
--
-- Dependencies: 017, 019, 023
-- DOWN: 024_department_manager_project_students.down.sql
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
