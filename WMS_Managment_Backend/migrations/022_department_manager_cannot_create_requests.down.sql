-- ============================================================================
-- 022_department_manager_cannot_create_requests.down.sql  (DOWN)
-- Re-grants the department_manager role the ability to create material
-- requests. Used only for rolling back migration 022.
-- ============================================================================
BEGIN;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'department_manager'
  AND p.code = 'requests:create'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
