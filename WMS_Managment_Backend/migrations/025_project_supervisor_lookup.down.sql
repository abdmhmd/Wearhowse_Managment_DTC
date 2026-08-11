-- ============================================================================
-- 025_project_supervisor_lookup.down.sql  (DOWN)
-- Reverts the dedicated project supervisor lookup permission.
-- ============================================================================
BEGIN;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code IN ('system_admin', 'warehouse_manager')
  AND p.code = 'projects:supervisors';

DELETE FROM permissions WHERE code = 'projects:supervisors';

COMMIT;
