-- ============================================================================
-- 030_supervisor_request_creation.down.sql
-- Reverse of 030: revoke the four supervisor grants added by the UP migration.
-- The permission CODES stay in the catalog (they pre-date this migration); the
-- supervisor role simply loses the ability to create/view material requests and
-- to read projects.
-- ============================================================================
BEGIN;

WITH matrix(code, perm) AS (VALUES
  ('supervisor', 'requests:create'),
  ('supervisor', 'requests:view'),
  ('supervisor', 'requests:view_own'),
  ('supervisor', 'projects:view')
)
DELETE FROM role_permissions rp
USING matrix m, roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = m.code
  AND p.code = m.perm;

COMMIT;
