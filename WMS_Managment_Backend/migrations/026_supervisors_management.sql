-- ============================================================================
-- 026_supervisors_management.sql  (UP)
-- Supervisors management for the Department Head dashboard.
--
-- A supervisor is a user with role `department_manager`. Department Heads
-- manage the supervisors of their OWN department via a dedicated page
-- (GET /api/supervisors). These endpoints must NOT depend on `users:view`
-- (revoked from department_manager in migration 019), so dedicated
-- permissions are introduced here.
--
-- Granted to:
--   * system_admin        - manage supervisors of any department
--   * department_manager  - manage supervisors of their own department only
-- Not granted to warehouse_manager (they only read via `projects:supervisors`).
--
-- Dependencies: 017, 019
-- DOWN: 026_supervisors_management.down.sql
-- ============================================================================
BEGIN;

INSERT INTO permissions (code, resource, action, description)
VALUES
  ('supervisors:view',   'supervisors', 'view',
   'View supervisors of the caller department'),
  ('supervisors:create', 'supervisors', 'create',
   'Create a supervisor in the caller department'),
  ('supervisors:update', 'supervisors', 'update',
   'Update a supervisor of the caller department'),
  ('supervisors:delete', 'supervisors', 'delete',
   'Delete a supervisor of the caller department')
ON CONFLICT (code) DO NOTHING;

WITH matrix(code, perm) AS (VALUES
  ('system_admin',       'supervisors:view'),
  ('system_admin',       'supervisors:create'),
  ('system_admin',       'supervisors:update'),
  ('system_admin',       'supervisors:delete'),
  ('department_manager', 'supervisors:view'),
  ('department_manager', 'supervisors:create'),
  ('department_manager', 'supervisors:update'),
  ('department_manager', 'supervisors:delete')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
