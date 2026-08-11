-- ============================================================================
-- 027_add_supervisor_role.down.sql
-- Removes the supervisor role. The enum value is only dropped when no user
-- rows reference it (safe for environments that never created supervisors);
-- otherwise it is kept to preserve data integrity.
-- ============================================================================
BEGIN;

DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE code = 'supervisor');

DELETE FROM roles WHERE code = 'supervisor';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role')
     AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'supervisor') THEN
    ALTER TYPE user_role DROP VALUE IF EXISTS 'supervisor';
  END IF;
END $$;

COMMIT;
