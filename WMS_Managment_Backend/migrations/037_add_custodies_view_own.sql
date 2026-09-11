-- ============================================================================
-- 037_add_custodies_view_own.sql  (UP)
-- [PHASE 0 SAFETY NET] Restore /my-custody route reachability.
--
-- The frontend guards the /my-custody route with the permission
-- 'custodies:view_own' (WMS_Frontend/src/App.tsx:127, Sidebar.tsx:49,
-- WMS_Frontend/src/types/index.ts:32), but the permission existed only in the
-- frontend catalog — it was missing from the backend catalog and from the
-- `permissions` table. As a result, no user held it and the page was
-- unreachable for every role.
--
-- 1. Adds 'custodies:view_own' to the backend permissions catalog.
-- 2. Grants it to the roles that can actually HOLD a custody record. In the
--    current model a custody is assigned to `material_requests.requested_by`
--    when a non-consumable item is issued (material-requests.service.ts), i.e.
--    the requester. Requesters are: supervisor, warehouse_manager and
--    system_admin. department_manager cannot create material requests
--    (migration 022) and therefore never holds a custody, so it does NOT
--    receive this permission.
--
-- This is a purely additive, read-only permission. No existing grant is
-- revoked or modified. The backend custody list is already scoped to the
-- caller for NONE-scope users (custodies.repository.ts: custodyScopeClause ->
-- c.assigned_to = user.id), so the new permission only unlocks the route; the
-- data visible is unchanged.
--
-- DEPENDENCY: 017 (roles, permissions, role_permissions), 022, 027 (supervisor)
-- NOTE: role codes 'system_admin' / 'warehouse_manager' are replaced by the
--       agreed model ('admin' / 'sub_warehouse_manager') in a later migration;
--       role_permissions rows follow roles.id, so these grants survive it.
-- DOWN: 037_add_custodies_view_own.down.sql
-- ============================================================================
BEGIN;

INSERT INTO permissions (code, resource, action, description)
VALUES ('custodies:view_own', 'custodies', 'view_own',
        'View custody records assigned to the current user')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code IN ('supervisor', 'warehouse_manager', 'system_admin')
  AND r.is_active = true
  AND p.code = 'custodies:view_own'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
     WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

COMMIT;