-- ============================================================================
-- 020_warehouse_routing_constraints.down.sql
-- Reverses 020_warehouse_routing_constraints.sql
-- ============================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_material_request_warehouse ON material_requests;
DROP FUNCTION IF EXISTS enforce_material_request_warehouse();

DROP INDEX IF EXISTS uq_warehouses_main_per_department;

-- role_permissions cleanup is intentionally NOT restored (idempotent inserts in
-- 017 would re-add grants for deactivated roles on re-run of that migration).

COMMIT;
