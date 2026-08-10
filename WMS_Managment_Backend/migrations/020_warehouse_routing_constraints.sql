-- ============================================================================
-- 020_warehouse_routing_constraints.sql  (UP)
-- Goal: make the main-warehouse -> department-warehouse issuance model
-- impossible to break from the application layer.
--   * at most ONE active main warehouse per department (plus at most one
--     active GLOBAL main warehouse, i.e. department_id IS NULL);
--   * a material request's destination warehouse must belong to the request's
--     department, and may not be that department's own main warehouse;
--   * drop leftover role_permissions rows for deactivated roles so they can
--     never be re-activated with stale privileges.
--
-- Dependencies: 019 (warehouses.is_main / warehouses.department_id)
-- DOWN: 020_warehouse_routing_constraints.down.sql
-- ============================================================================
BEGIN;

-- 1. Drop stale permission grants for deactivated roles -----------------------
-- storekeeper / accountant / viewer were deactivated in 019; their role matrix
-- rows are dead weight and would grant stale rights if a role were re-enabled.
DELETE FROM role_permissions rp
USING roles r
WHERE rp.role_id = r.id AND r.is_active = false;

-- 1b. warehouse_manager becomes operational read-only for the request workflow.
-- 019 forgot to strip the approval/issue permissions it inherited from the old
-- storekeeper-era matrix; only 'requests:create' (their own requests) and
-- 'requests:cancel' remain. Approval, forwarding approval, rejection and
-- issuance are system_admin-only.
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'warehouse_manager'
  AND p.code IN ('requests:approve', 'requests:reject', 'requests:issue');

-- 2. Single active main warehouse per department ------------------------------
-- Normalize existing data first: keep only the LOWEST-id active main warehouse
-- per department (a deactivated warehouse no longer counts as main).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(department_id, 0)
           ORDER BY id
         ) AS rn
  FROM warehouses
  WHERE is_main = true AND is_active = true
)
UPDATE warehouses w
SET is_main = false
FROM ranked r
WHERE w.id = r.id AND r.rn > 1;

-- Enforce the invariant going forward. COALESCE lets one global main warehouse
-- (department_id IS NULL) coexist with one main warehouse per department.
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_main_per_department
  ON warehouses (COALESCE(department_id, 0))
  WHERE is_main = true AND is_active = true;

-- 3. Material requests must target their department's warehouse ---------------
-- Requests are fulfilled from the department's MAIN warehouse into a
-- DEPARTMENT warehouse. Enforce both relationships in the database so the
-- issuing code can never route stock across departments.
CREATE OR REPLACE FUNCTION enforce_material_request_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  -- Requests without a department (legacy/global) are not cross-checked.
  IF NEW.department_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- The destination warehouse must belong to the request's department.
  IF NOT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = NEW.warehouse_id
      AND w.department_id = NEW.department_id
      AND w.is_active = true
  ) THEN
    RAISE EXCEPTION
      'Material request warehouse %s does not belong to department %s',
      NEW.warehouse_id, NEW.department_id;
  END IF;

  -- The destination must not be the department's own MAIN warehouse: the main
  -- warehouse is the source of stock, the department warehouse is the sink.
  IF EXISTS (
    SELECT 1 FROM warehouses m
    WHERE m.department_id = NEW.department_id
      AND m.is_main = true
      AND m.is_active = true
      AND m.id = NEW.warehouse_id
  ) THEN
    RAISE EXCEPTION
      'Material request must not target the department main warehouse %s',
      NEW.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_request_warehouse ON material_requests;
CREATE TRIGGER trg_material_request_warehouse
BEFORE INSERT OR UPDATE OF department_id, warehouse_id ON material_requests
FOR EACH ROW EXECUTE FUNCTION enforce_material_request_warehouse();

COMMIT;
