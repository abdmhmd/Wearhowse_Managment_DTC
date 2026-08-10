-- ============================================================================
-- 022_department_manager_cannot_create_requests.sql  (UP)
-- Goal: final business-rule fix — a department_manager is the APPROVAL layer
-- for their department, never the request creator. The intended creator is the
-- warehouse_manager of the department warehouse (or the system_admin).
--
-- Migration 019 temporarily granted department_manager requests:create with an
-- explicit note that it "will be removed in a later migration once we have
-- seeded department warehouses". This is that removal.
--
-- The permission is revoked from the ROLE. The service layer is additionally
-- hardened to fail closed (see material-requests.service.ts createRequest),
-- and the frontend no longer shows the create/issue controls for this role.
--
-- DOWN: 022_department_manager_cannot_create_requests.down.sql
-- ============================================================================
BEGIN;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'department_manager'
  AND p.code = 'requests:create';

COMMIT;
