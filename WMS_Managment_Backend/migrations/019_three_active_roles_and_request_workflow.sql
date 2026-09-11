-- ============================================================================
-- 019_three_active_roles_and_request_workflow.sql  (UP)
-- Goal: only three active roles remain.
--   * system_admin       - full access to every module.
--   * warehouse_manager  - operational READ-ONLY role: sees stock, inventory
--     state, requests and reports for their assigned warehouses; may create
--     and cancel their own requests. No master-data writes, no user or
--     settings access, no project/custody mutations.
--   * department_manager - department workflow role: creates requests for
--     their department, APPROVES them at department level (requests:approve)
--     and FORWARDS the dept-approved request to the warehouse admin
--     (requests:forward). No stock mutation of any kind.
--   * storekeeper / accountant / viewer are DEACTIVATED. Their users keep the
--     legacy role value (data continuity) but their sessions are revoked; the
--     login service refuses active sessions for inactive roles until an admin
--     reassigns the user to one of the three active roles.
--
-- Also introduces:
--   * new permission            requests:forward
--   * warehouses.is_main        (main-warehouse marker)
--   * warehouses.department_id  (owning department, used for cross-module
--     scoping and for the dept -> warehouse request routing)
--   * extended material request workflow states and actor-tracking columns
--     (dept_approved_by/dept_approved_at/forwarded_by/forwarded_at/rejected_by)
--
-- ENUM NOTE: PostgreSQL forbids using a value added via
-- ALTER TYPE ... ADD VALUE inside the same transaction. Because the migration
-- runner (scripts/run-migrations.ts) wraps every file in BEGIN/COMMIT, the
-- request_status type is RECREATED here instead (dropping the superseded
-- legacy states 'approved' / 'rejected'; existing rows are migrated to the
-- equivalent admin_* states).
--
-- Dependencies: 001, 016, 017, 018
-- DOWN: 019_three_active_roles_and_request_workflow.down.sql
-- ============================================================================
BEGIN;

-- 1. New permission -----------------------------------------------------------
INSERT INTO permissions (code, resource, action, description)
VALUES ('requests:forward', 'requests', 'forward',
        'Forward a department-approved material request to the warehouse admin')
ON CONFLICT (code) DO NOTHING;

-- 2. Deactivate legacy roles --------------------------------------------------
UPDATE roles
SET is_active = false, updated_at = CURRENT_TIMESTAMP
WHERE code IN ('viewer', 'accountant', 'storekeeper');

-- Revoke sessions of users holding a deactivated role. The role value is kept
-- on the user row for data continuity; the auth service refuses to issue new
-- sessions until an admin reassigns the user to an active role.
UPDATE users
SET token_version = token_version + 1
WHERE role IN ('viewer', 'accountant', 'storekeeper')
  AND is_active = true;

-- 3. warehouse_manager -> operational read-only -------------------------------
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'warehouse_manager'
  AND p.code IN (
    'categories:create', 'categories:update',
    'units:create', 'units:update',
    'suppliers:create', 'suppliers:update',
    'departments:create', 'departments:update',
    'warehouses:create', 'warehouses:update',
    'users:view',
    'items:create', 'items:update',
    'unit-conversions:create', 'unit-conversions:update',
    'stock-movements:view-all',
    'settings:view',
    'projects:create', 'projects:update', 'projects:close',
    'custodies:return'
  );

-- 4. department_manager -> department workflow --------------------------------
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'department_manager'
  AND p.code IN (
    'users:view',
    'settings:view',
    'projects:create', 'projects:update', 'projects:close',
    'custodies:return'
  );

-- Department managers approve their own department's requests and forward the
-- dept-approved request to the warehouse admin for issuance.
WITH matrix(code, perm) AS (VALUES
  ('department_manager', 'requests:approve'),
  ('department_manager', 'requests:forward'),
  ('system_admin',       'requests:forward')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Warehouses: main marker + owning department ------------------------------
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS is_main BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;

UPDATE warehouses
SET is_main = true
WHERE is_main = false
  AND (code ILIKE '%MAIN%' OR name_en ILIKE '%main%' OR name_ar LIKE '%رئيسي%');

CREATE INDEX IF NOT EXISTS idx_warehouses_department ON warehouses(department_id);

-- 6. Material request workflow states -----------------------------------------
DO $$
BEGIN
  ALTER TABLE material_requests ALTER COLUMN status DROP DEFAULT;
  ALTER TABLE material_requests ALTER COLUMN status TYPE VARCHAR(50) USING status::text;

  UPDATE material_requests SET status = 'admin_approved' WHERE status = 'approved';
  UPDATE material_requests SET status = 'admin_rejected' WHERE status = 'rejected';

  DROP TYPE IF EXISTS request_status CASCADE;

  EXECUTE 'CREATE TYPE request_status AS ENUM (
    ''pending'',
    ''dept_approved'',
    ''forwarded'',
    ''admin_approved'',
    ''admin_rejected'',
    ''issued'',
    ''cancelled''
  )';

  EXECUTE 'ALTER TABLE material_requests ALTER COLUMN status TYPE request_status USING status::request_status';
  EXECUTE 'ALTER TABLE material_requests ALTER COLUMN status SET DEFAULT ''pending''::request_status';
END $$;

-- 7. Actor tracking for the extended workflow ---------------------------------
ALTER TABLE material_requests
  ADD COLUMN IF NOT EXISTS dept_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dept_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forwarded_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by      INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mr_department_status ON material_requests(department_id, status);
CREATE INDEX IF NOT EXISTS idx_mr_forwarded_by ON material_requests(forwarded_by);

COMMIT;
