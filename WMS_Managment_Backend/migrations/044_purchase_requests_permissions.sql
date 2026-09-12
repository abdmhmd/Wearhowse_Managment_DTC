-- ============================================================================
-- 044_purchase_requests_permissions.sql  (UP)
-- Phase 4.1 / Purchase Request permission codes + role grants.
--
-- New codes (resource 'purchase-requests'):
--   view          - see all purchase requests (list/detail; data-scoped)
--   view_own      - see own purchase requests (creator-only)
--   create        - create a purchase request
--   cancel        - cancel an own PENDING purchase request (creator-only)
--   approve-dept  - department-level approval (dept_approved)
--   reject-dept   - department-level rejection (rejected)
--   approve-admin - admin-level approval -> admin_approved + AUTO-PO
--   reject-admin  - admin-level rejection (rejected)
--
-- Role matrix (empty for supervisor by design):
--   sub_warehouse_manager : view_own, create, cancel
--   department_manager    : view, approve-dept, reject-dept
--   admin                 : view, approve-admin, reject-admin
--
-- Replay-safe: ON CONFLICT guards; the note is written only once.
-- DOWN: 044_purchase_requests_permissions.down.sql
-- ============================================================================
BEGIN;

-- 1. Permission catalog ------------------------------------------------------
INSERT INTO permissions (code, resource, action, description) VALUES
  ('purchase-requests:view',         'purchase-requests', 'view',         'View purchase requests'),
  ('purchase-requests:view_own',     'purchase-requests', 'view_own',     'View own purchase requests'),
  ('purchase-requests:create',       'purchase-requests', 'create',       'Create purchase requests'),
  ('purchase-requests:cancel',       'purchase-requests', 'cancel',       'Cancel own pending purchase requests'),
  ('purchase-requests:approve-dept', 'purchase-requests', 'approve-dept', 'Approve purchase request at department level'),
  ('purchase-requests:reject-dept',  'purchase-requests', 'reject-dept',  'Reject purchase request at department level'),
  ('purchase-requests:approve-admin','purchase-requests', 'approve-admin','Approve purchase request at admin level (auto-creates PO)'),
  ('purchase-requests:reject-admin', 'purchase-requests', 'reject-admin', 'Reject purchase request at admin level')
ON CONFLICT (code) DO NOTHING;

-- 2. Role grants -------------------------------------------------------------
WITH matrix(role_code, perm) AS (VALUES
  ('sub_warehouse_manager', 'purchase-requests:view_own'),
  ('sub_warehouse_manager', 'purchase-requests:create'),
  ('sub_warehouse_manager', 'purchase-requests:cancel'),
  ('department_manager',    'purchase-requests:view'),
  ('department_manager',    'purchase-requests:approve-dept'),
  ('department_manager',    'purchase-requests:reject-dept'),
  ('admin',                 'purchase-requests:view'),
  ('admin',                 'purchase-requests:approve-admin'),
  ('admin',                 'purchase-requests:reject-admin')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.role_code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Migration ledger --------------------------------------------------------
DO $$
DECLARE
  v_perm_codes int;
  v_grant_rows int;
BEGIN
  SELECT count(*) INTO v_perm_codes FROM permissions WHERE code LIKE 'purchase-requests:%';
  SELECT count(*) INTO v_grant_rows FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.code LIKE 'purchase-requests:%';

  INSERT INTO _migration_notes (note_key, payload)
  SELECT 'phase4_purchase_requests_permissions',
         jsonb_build_object(
           'permission_codes_seeded', v_perm_codes,
           'grant_rows_seeded',       v_grant_rows,
           'roles_granted',           ARRAY['sub_warehouse_manager','department_manager','admin'],
           'roles_excluded',          ARRAY['supervisor']
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_notes WHERE note_key = 'phase4_purchase_requests_permissions'
  );
END $$;

COMMIT;