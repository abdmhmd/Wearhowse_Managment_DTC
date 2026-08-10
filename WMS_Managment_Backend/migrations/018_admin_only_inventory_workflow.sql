-- ============================================================================
-- 018_admin_only_inventory_workflow.sql  (UP)
-- Enforces the WMS inventory authorization workflow:
--   * ONLY system_admin may directly create/modify stock
--     (transactions:create/approve, inventory:session:*, inventory:count:record).
--   * Request approval/rejection/issuing is an ADMIN responsibility
--     (requests:approve/reject/issue). Non-admins create requests and track
--     their own requests via the new requests:view_own permission.
--   * Non-admins keep requests:view / requests:create / requests:cancel
--     (cancel is own-pending-only, enforced in the service layer).
-- The permission CATALOG is unchanged except for the new requests:view_own
-- row; revocation/grants operate on the existing role_permissions matrix so
-- the change is fully reversible via the .down file.
--
-- Dependencies: 017_rbac_permissions.sql
-- Run inside a single transaction; rolled back atomically on any failure.
-- DOWN: 018_admin_only_inventory_workflow.down.sql
-- ============================================================================
BEGIN;

-- 1. New permission: view requests the user created ---------------------------
INSERT INTO permissions (code, resource, action, description)
VALUES ('requests:view_own', 'requests', 'view_own', 'View material requests the user created')
ON CONFLICT (code) DO NOTHING;

-- 2. Revoke direct inventory-mutating permissions from every non-admin role ---
-- Stock may only be changed directly by system_admin. Everyone else must go
-- through the Material Request -> Admin Approve -> Admin Issue workflow.
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code <> 'system_admin'
  AND p.code IN (
    'transactions:create',
    'transactions:approve',
    'inventory:session:open',
    'inventory:session:view',
    'inventory:count:record',
    'inventory:session:close',
    'requests:approve',
    'requests:reject',
    'requests:issue'
  );

-- 3. Grant requests:view_own to all non-admin roles; ensure storekeepers can
--    create requests (the workflow requires every non-admin to be able to
--    request stock through the request lifecycle). ---------------------------
WITH matrix(code, perm) AS (VALUES
  ('warehouse_manager',  'requests:view_own'),
  ('storekeeper',        'requests:view_own'),
  ('accountant',         'requests:view_own'),
  ('department_manager', 'requests:view_own'),
  ('viewer',             'requests:view_own'),
  ('storekeeper',        'requests:create')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
