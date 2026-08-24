-- ============================================================================
-- 031_supervisor_project_management.sql  (UP)
-- Enable the `supervisor` role (academic teacher, 027) to create and manage
-- their OWN graduation projects.
--
-- No NEW permission codes: all three already exist in the catalog (017). The
-- grants are the minimum for the supervisor project workflow:
--
--   * projects:create   - POST /api/projects (project creation route).
--   * projects:update   - PATCH /api/projects/:id + PUT /api/projects/:id/students.
--   * projects:delete   - DELETE /api/projects/:id (soft delete).
--
-- Least privilege: the supervisor does NOT get projects:close / projects:cancel
-- (project completion stays with warehouse managers / system_admin) nor
-- projects:supervisors (supervisors never pick a supervisor — every project
-- they create is assigned to THEMSELVES).
--
-- The permission only grants the CAPABILITY. Ownership/scoping is enforced in
-- projects.service.ts / projects.repository.ts: a supervisor resolves to NONE
-- scope, so list + getById are restricted to `supervisor_id = user.id` and
-- create forces supervisor_id = the authenticated user (a forged supervisor_id
-- in the payload cannot transfer ownership).
--
-- Dependencies: 017 (catalog), 023 (project workflow), 027 (role),
--               030 (supervisor request creation)
-- DOWN: 031_supervisor_project_management.down.sql
-- ============================================================================
BEGIN;

WITH matrix(code, perm) AS (VALUES
  ('supervisor', 'projects:create'),
  ('supervisor', 'projects:update'),
  ('supervisor', 'projects:delete')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
