-- ============================================================================
-- 037_add_custodies_view_own.down.sql  (DOWN)
-- Revokes 'custodies:view_own' from every role and removes it from the catalog.
-- ============================================================================
BEGIN;

DELETE FROM role_permissions
USING permissions p
WHERE role_permissions.permission_id = p.id
  AND p.code = 'custodies:view_own';

DELETE FROM permissions WHERE code = 'custodies:view_own';

COMMIT;