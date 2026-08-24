-- ============================================================================
-- 031_supervisor_project_management.down.sql
-- Reverse of 031: revoke the three supervisor project grants added by the UP
-- migration. The permission CODES stay in the catalog (they pre-date this
-- migration); the supervisor role simply loses the ability to create/update/
-- delete projects and keeps projects:view (read-only, from 030).
-- ============================================================================
BEGIN;

WITH matrix(code, perm) AS (VALUES
  ('supervisor', 'projects:create'),
  ('supervisor', 'projects:update'),
  ('supervisor', 'projects:delete')
)
DELETE FROM role_permissions rp
USING matrix m, roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = m.code
  AND p.code = m.perm;

COMMIT;
