-- Reverse migration 032

BEGIN;

-- Remove supervisor custody permissions
DELETE FROM role_permissions
 WHERE role_id = (SELECT id FROM roles WHERE code = 'supervisor' AND is_active = true)
   AND permission_id IN (
     SELECT id FROM permissions WHERE code IN ('custodies:view', 'custodies:return')
   );

-- Remove columns
ALTER TABLE custodies DROP COLUMN IF EXISTS pending_return_quantity;
ALTER TABLE custodies DROP COLUMN IF EXISTS return_notes;

-- Cannot remove enum values in PostgreSQL; skip enum rollback (forward-only).
-- Revoke WM approve/issue permissions
DELETE FROM role_permissions
 WHERE role_id = (SELECT id FROM roles WHERE code = 'warehouse_manager' AND is_active = true)
   AND permission_id IN (
     SELECT id FROM permissions WHERE code IN ('requests:approve', 'requests:issue')
   );

COMMIT;
