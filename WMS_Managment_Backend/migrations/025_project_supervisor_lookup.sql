-- ============================================================================
-- 025_project_supervisor_lookup.sql  (UP)
-- Project supervisor lookup for the project create/edit form.
--
-- The previous guard on GET /api/users/supervisors was `users:view`, which was
-- revoked from warehouse_manager and department_manager in migration 019. A
-- warehouse_manager (project owner since 023) therefore received 403 when the
-- Projects page tried to load the supervisor dropdown.
--
-- Fix: a DEDICATED permission `projects:supervisors`, granted only to roles
-- that manage projects. It does NOT restore `users:view` — the endpoint is a
-- narrow, department-scoped lookup (service enforces the scope) and grants no
-- global user listing.
--
-- Granted to:
--   * system_admin        - global supervisor lookup (unchanged behavior)
--   * warehouse_manager   - supervisors scoped to their own department
-- Not granted to department_manager / other roles (403 preserved).
--
-- Dependencies: 017, 019, 023
-- DOWN: 025_project_supervisor_lookup.down.sql
-- ============================================================================
BEGIN;

INSERT INTO permissions (code, resource, action, description)
VALUES ('projects:supervisors', 'projects', 'supervisors',
        'Look up candidate project supervisors (scoped to the caller department)')
ON CONFLICT (code) DO NOTHING;

WITH matrix(code, perm) AS (VALUES
  ('system_admin',       'projects:supervisors'),
  ('warehouse_manager',  'projects:supervisors')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
