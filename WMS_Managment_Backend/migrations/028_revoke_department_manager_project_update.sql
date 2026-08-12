-- ============================================================================
-- 028_revoke_department_manager_project_update.sql  (UP)
-- The Department Head (department_manager) is VIEW-ONLY on projects.
--
-- Migration 024 granted department_manager `projects:update` so they could
-- maintain the free-text student roster. Per the current requirement the
-- Department Head may only VIEW projects of their own department — no edit,
-- no student-roster changes, no create. This revokes the grant again:
--
--   * PATCH /api/projects/:id            -> 403 (authorize('projects:update'))
--   * PUT   /api/projects/:id/students   -> 403 (authorize('projects:update'))
--
-- The Projects page frontend also gates the edit / students buttons on
-- `can('projects:update')`, so with the grant gone the actions are hidden and
-- the page no longer fetches the supervisor list (which DM cannot access).
--
-- Dependencies: 017, 019, 024
-- DOWN: 028_revoke_department_manager_project_update.down.sql
-- ============================================================================
BEGIN;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'department_manager'
  AND p.code = 'projects:update';

COMMIT;
