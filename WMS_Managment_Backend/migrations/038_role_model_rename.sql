-- ============================================================================
-- 038_role_model_rename.sql  (UP)
-- Goal: rename the role model from the legacy 7-role set to the agreed
-- 4-role set.
--   * system_admin       -> admin                  (GLOBAL scope)
--   * warehouse_manager  -> sub_warehouse_manager  (department/warehouse scope)
--   * department_manager -> department_manager     (unchanged)
--   * supervisor         -> supervisor             (unchanged)
--   * storekeeper / accountant / viewer are REMOVED. Their users are
--     reassigned: sub_warehouse_manager when they hold user_warehouses rows,
--     otherwise admin. Every decision is logged to _migration_notes.
--
-- Also:
--   * recreates the user_role ENUM with exactly the four new labels
--     (PostgreSQL has no ALTER TYPE ... RENAME VALUE ... OR DROP VALUE, so the
--     type is recreated the same way migration 019 recreated request_status)
--   * renames the active rows in the `roles` table (codes only; display names
--     and permission matrices are untouched -> NO permission changes, those
--     belong to Phase 2)
--   * removes the legacy role rows (they hold zero role_permissions)
--   * increments token_version for every user whose role changed so existing
--     sessions are invalidated and clients re-authenticate with the new role
--     claim
--   * snapshots the roles table, role_permissions rows and every per-user
--     rename into _migration_notes so the DOWN migration can restore them
--     exactly
--
-- The migration is replay-safe: it only acts on rows that still carry old
-- values, so replaying the file against an already-migrated database is a
-- no-op for the data parts, and the enum recreation is guarded by a DO block.
--
-- Dependencies: 001, 017, 019, 020-037
-- DOWN: 038_role_model_rename.down.sql
-- ============================================================================

BEGIN;

-- 1. Notes ledger -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _migration_notes (
  id         BIGSERIAL PRIMARY KEY,
  note_key   TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Refresh snapshots on replay (no-op when no previous run left data).
DELETE FROM _migration_notes WHERE note_key IN
  ('role_rename', 'roles_snapshot', 'role_permissions_snapshot');

INSERT INTO _migration_notes (note_key, payload)
SELECT 'roles_snapshot', jsonb_agg(jsonb_build_object(
         'id', id, 'code', code, 'name_ar', name_ar, 'name_en', name_en,
         'description', description, 'is_active', is_active))
FROM roles;

INSERT INTO _migration_notes (note_key, payload)
SELECT 'role_permissions_snapshot',
       jsonb_agg(jsonb_build_object('role_id', role_id, 'permission_id', permission_id))
FROM role_permissions;

-- Log every user whose role changes, with their original token_version.
WITH mapped AS (
  SELECT u.id, u.username, u.role::text AS old_role,
         CASE
           WHEN u.role::text = 'system_admin'                             THEN 'admin'
           WHEN u.role::text = 'warehouse_manager'                        THEN 'sub_warehouse_manager'
           WHEN u.role::text IN ('storekeeper','accountant','viewer')
                AND EXISTS (SELECT 1 FROM user_warehouses uw WHERE uw.user_id = u.id)
                                                                          THEN 'sub_warehouse_manager'
           WHEN u.role::text IN ('storekeeper','accountant','viewer')     THEN 'admin'
           ELSE u.role::text
         END AS new_role,
         COALESCE(u.token_version, 0) AS token_version_before
  FROM users u
)
INSERT INTO _migration_notes (note_key, payload)
SELECT 'role_rename', jsonb_build_object(
         'user_id', id, 'username', username, 'old_role', old_role,
         'new_role', new_role, 'token_version_before', token_version_before)
FROM mapped
WHERE old_role <> new_role;

-- 2. Data migration -----------------------------------------------------------
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::text;

UPDATE users SET role = 'admin'                 WHERE role = 'system_admin';
UPDATE users SET role = 'sub_warehouse_manager' WHERE role = 'warehouse_manager';
UPDATE users SET role = 'sub_warehouse_manager'
WHERE role IN ('storekeeper','accountant','viewer')
  AND id IN (SELECT user_id FROM user_warehouses);
UPDATE users SET role = 'admin'
WHERE role IN ('storekeeper','accountant','viewer')
  AND id NOT IN (SELECT user_id FROM user_warehouses);

-- 3. Recreate the user_role enum (4 labels) -----------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) THEN
    DROP TYPE IF EXISTS user_role CASCADE;
    CREATE TYPE user_role AS ENUM (
      'admin', 'sub_warehouse_manager', 'department_manager', 'supervisor'
    );
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- 4. roles table: rename active codes, drop legacy rows -----------------------
UPDATE roles SET code = 'admin', updated_at = CURRENT_TIMESTAMP
WHERE code = 'system_admin';
UPDATE roles SET code = 'sub_warehouse_manager', updated_at = CURRENT_TIMESTAMP
WHERE code = 'warehouse_manager';

DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles
                  WHERE code IN ('storekeeper','accountant','viewer'));

DELETE FROM roles WHERE code IN ('storekeeper','accountant','viewer');

-- 5. Invalidate existing sessions for every changed user ----------------------
UPDATE users u
SET token_version = COALESCE(u.token_version, 0) + 1
FROM _migration_notes n
WHERE n.note_key = 'role_rename'
  AND n.payload->>'user_id' = u.id::text;

COMMIT;