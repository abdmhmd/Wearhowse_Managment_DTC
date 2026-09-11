-- ============================================================================
-- 038_role_model_rename.sql  (DOWN)
-- Reverses 038 using the snapshots stored in _migration_notes:
--   * recreates the 7-value user_role enum and restores every user's original
--     role value and token_version (from the per-user rename ledger)
--   * renames the active roles rows back to the legacy codes
--   * re-inserts the removed legacy role rows (storekeeper/accountant/viewer)
--     with their original fields (they held zero role_permissions in this
--     schema; the snapshot restore is kept symmetric with multi-permission
--     migrations anyway)
--   * drops the _migration_notes ledger
--
-- Post-038 users are handled: any user created AFTER 038 with role 'admin' or
-- 'sub_warehouse_manager' is mapped back onto system_admin / warehouse_manager.
-- ============================================================================

BEGIN;

-- 1. Free the role column for string work -------------------------------------
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::text;

-- 2. Restore user roles -------------------------------------------------------
-- 2a. Every user that was renamed by 038 gets their exact original role back.
UPDATE users u
SET role = n.payload->>'old_role'
FROM _migration_notes n
WHERE n.note_key = 'role_rename'
  AND n.payload->>'user_id' = u.id::text;

-- 2b. Users created AFTER 038 (not in the ledger) map back onto the legacy
--     active codes.
UPDATE users SET role = 'system_admin' WHERE role = 'admin';
UPDATE users SET role = 'warehouse_manager' WHERE role = 'sub_warehouse_manager';

-- 3. Restore token_version for every renamed user -----------------------------
UPDATE users u
SET token_version = (n.payload->>'token_version_before')::int
FROM _migration_notes n
WHERE n.note_key = 'role_rename'
  AND n.payload->>'user_id' = u.id::text;

-- 4. Restore the roles table --------------------------------------------------
UPDATE roles SET code = 'system_admin', updated_at = CURRENT_TIMESTAMP
WHERE code = 'admin';
UPDATE roles SET code = 'warehouse_manager', updated_at = CURRENT_TIMESTAMP
WHERE code = 'sub_warehouse_manager';

INSERT INTO roles (id, code, name_ar, name_en, description, is_active)
SELECT (r->>'id')::int, r->>'code', r->>'name_ar', r->>'name_en', r->>'description',
       (r->>'is_active')::boolean
FROM _migration_notes, jsonb_array_elements(payload) AS r
WHERE note_key = 'roles_snapshot'
  AND r->>'code' IN ('storekeeper','accountant','viewer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT (p->>'role_id')::int, (p->>'permission_id')::int
FROM _migration_notes, jsonb_array_elements(payload) AS p
WHERE note_key = 'role_permissions_snapshot'
  AND (p->>'role_id')::int IN (SELECT id FROM roles
                               WHERE code IN ('storekeeper','accountant','viewer'))
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Recreate the 7-value enum and re-apply it --------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'storekeeper'
  ) THEN
    DROP TYPE IF EXISTS user_role CASCADE;
    CREATE TYPE user_role AS ENUM (
      'system_admin', 'warehouse_manager', 'storekeeper', 'accountant',
      'department_manager', 'viewer', 'supervisor'
    );
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- 6. Drop the ledger ----------------------------------------------------------
DROP TABLE IF EXISTS _migration_notes;

COMMIT;