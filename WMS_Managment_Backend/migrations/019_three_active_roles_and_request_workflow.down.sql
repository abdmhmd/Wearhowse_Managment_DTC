-- ============================================================================
-- 019_three_active_roles_and_request_workflow.sql  (DOWN)
-- Reverses 019 as far as PostgreSQL allows:
--   * removes the workflow permission and department-manager approval grants
--   * restores the 017-era role matrices for warehouse_manager / department_manager
--   * reactivates the legacy roles (viewer / accountant / storekeeper)
--   * recreated the request_status enum back to its original five states and
--     maps workflow data onto the closest legacy states (best effort)
--   * drops the new material_requests actor columns and the warehouse helpers
--
-- Limitation: PostgreSQL has no ALTER TYPE ... DROP VALUE, so the new enum
-- members introduced in 019 cannot be surgically removed; the enum is recreated
-- in its original shape and any rows in the intermediate dept_* states are
-- flattened onto their legacy equivalent.
-- ============================================================================
BEGIN;

-- 1. Remove the workflow permissions and grants -------------------------------
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.code = 'requests:forward'
  AND r.code IN ('department_manager', 'system_admin');

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'department_manager'
  AND p.code = 'requests:approve';

DELETE FROM permissions WHERE code = 'requests:forward';

-- 2. Restore the 017-era warehouse_manager matrix -----------------------------
WITH matrix(code, perm) AS (VALUES
  ('warehouse_manager', 'categories:create'), ('warehouse_manager', 'categories:update'),
  ('warehouse_manager', 'units:create'), ('warehouse_manager', 'units:update'),
  ('warehouse_manager', 'suppliers:create'), ('warehouse_manager', 'suppliers:update'),
  ('warehouse_manager', 'departments:create'), ('warehouse_manager', 'departments:update'),
  ('warehouse_manager', 'warehouses:create'), ('warehouse_manager', 'warehouses:update'),
  ('warehouse_manager', 'users:view'),
  ('warehouse_manager', 'items:create'), ('warehouse_manager', 'items:update'),
  ('warehouse_manager', 'unit-conversions:create'), ('warehouse_manager', 'unit-conversions:update'),
  ('warehouse_manager', 'stock-movements:view-all'),
  ('warehouse_manager', 'settings:view'),
  ('warehouse_manager', 'projects:create'), ('warehouse_manager', 'projects:update'), ('warehouse_manager', 'projects:close'),
  ('warehouse_manager', 'custodies:return')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Restore the 017-era department_manager matrix ----------------------------
WITH matrix(code, perm) AS (VALUES
  ('department_manager', 'users:view'),
  ('department_manager', 'settings:view'),
  ('department_manager', 'projects:create'), ('department_manager', 'projects:update'), ('department_manager', 'projects:close'),
  ('department_manager', 'custodies:return')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Reactivate legacy roles --------------------------------------------------
UPDATE roles
SET is_active = true, updated_at = CURRENT_TIMESTAMP
WHERE code IN ('viewer', 'accountant', 'storekeeper');

-- 5. Restore the legacy request_status enum -----------------------------------
ALTER TABLE material_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE material_requests ALTER COLUMN status TYPE TEXT USING status::text;

UPDATE material_requests SET status = 'approved' WHERE status IN ('admin_approved', 'dept_approved', 'forwarded');
UPDATE material_requests SET status = 'rejected' WHERE status = 'admin_rejected';

DROP TYPE request_status;
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'issued', 'cancelled');
ALTER TABLE material_requests ALTER COLUMN status TYPE request_status USING status::request_status;
ALTER TABLE material_requests ALTER COLUMN status SET DEFAULT 'pending'::request_status;

-- 6. Drop the workflow actor columns ------------------------------------------
ALTER TABLE material_requests
  DROP COLUMN IF EXISTS dept_approved_by,
  DROP COLUMN IF EXISTS dept_approved_at,
  DROP COLUMN IF EXISTS forwarded_by,
  DROP COLUMN IF EXISTS forwarded_at,
  DROP COLUMN IF EXISTS rejected_by;

DROP INDEX IF EXISTS idx_mr_department_status;
DROP INDEX IF EXISTS idx_mr_forwarded_by;

-- 7. Drop the warehouse helpers ------------------------------------------------
DROP INDEX IF EXISTS idx_warehouses_department;
ALTER TABLE warehouses
  DROP COLUMN IF EXISTS is_main,
  DROP COLUMN IF EXISTS department_id;

COMMIT;
