-- ============================================================================
-- 030_supervisor_request_creation.sql  (UP)
-- Enable the `supervisor` role (academic teacher, introduced in 027) to create
-- material issue requests for their own department and to track them.
--
-- No NEW permission codes: all four already exist in the catalog (017). The
-- grants are the absolute minimum for the supervisor workflow:
--
--   * requests:create   - create a request (POST /api/requests requires it).
--   * requests:view     - pass the request list/detail ROUTES. The service and
--                         repository then scope list + detail to the caller's
--                         OWN requests ONLY: a supervisor resolves to NONE
--                         scope (scope.ts), so findAll restricts to
--                         `mr.requested_by = user.id` (requests:view_own) and
--                         getById requires requested_by == user.id.
--   * requests:view_own - visibility of one's own requests in list + detail.
--   * projects:view     - read access to the projects the supervisor supervises
--                         (projects.repository scopes the list to
--                         p.supervisor_id = user.id). Needed to attach a
--                         request to a graduation project.
--
-- Least privilege: NO projects/warehouses/users/items/categories/suppliers
-- create|update|delete; NO requests approve|forward|reject|issue|cancel (the
-- supervisor creates, the department_manager approves and forwards — no
-- auto-approval). The department_manager rule from 022 (approval layer, cannot
-- create requests) is untouched.
--
-- Backend enforcement is added in material-requests.service.ts: the supervisor
-- department is DERIVED from the authenticated user, the destination warehouse
-- must belong to that department, and a project request is only allowed when
-- project.supervisor_id == user.id AND project.department_id == user's
-- department (existing PROJECT_DEPARTMENT_MISMATCH check).
--
-- Dependencies: 017 (catalog), 022 (DM rule), 027 (role)
-- DOWN: 030_supervisor_request_creation.down.sql
-- ============================================================================
BEGIN;

WITH matrix(code, perm) AS (VALUES
  ('supervisor', 'requests:create'),
  ('supervisor', 'requests:view'),
  ('supervisor', 'requests:view_own'),
  ('supervisor', 'projects:view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
