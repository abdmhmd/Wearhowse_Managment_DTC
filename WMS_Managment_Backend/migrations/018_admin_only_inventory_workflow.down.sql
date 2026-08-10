-- ============================================================================
-- 018_admin_only_inventory_workflow.down.sql
-- Reverses migration 018: restores the direct inventory permissions to the
-- roles that held them under migration 017, and removes requests:view_own.
-- ============================================================================
BEGIN;

-- 1. Remove requests:view_own from every role and the requests:create added to
--    storekeeper by 018 --------------------------------------------------------
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND (
    p.code = 'requests:view_own'
    OR (p.code = 'requests:create' AND r.code = 'storekeeper')
  );

-- 2. Restore the permission matrix as seeded by 017_rbac_permissions.sql ------
WITH matrix(code, perm) AS (VALUES
  -- warehouse_manager (full inventory management under 017)
  ('warehouse_manager', 'transactions:create'),
  ('warehouse_manager', 'transactions:approve'),
  ('warehouse_manager', 'inventory:session:open'),
  ('warehouse_manager', 'inventory:session:view'),
  ('warehouse_manager', 'inventory:count:record'),
  ('warehouse_manager', 'inventory:session:close'),
  ('warehouse_manager', 'requests:approve'),
  ('warehouse_manager', 'requests:reject'),
  ('warehouse_manager', 'requests:issue'),
  -- storekeeper
  ('storekeeper', 'transactions:create'),
  ('storekeeper', 'inventory:session:view'),
  ('storekeeper', 'inventory:count:record'),
  ('storekeeper', 'requests:approve'),
  ('storekeeper', 'requests:reject'),
  ('storekeeper', 'requests:issue'),
  -- accountant (read-only inventory session visibility)
  ('accountant', 'inventory:session:view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Drop the new permission row ----------------------------------------------
DELETE FROM permissions WHERE code = 'requests:view_own';

COMMIT;
