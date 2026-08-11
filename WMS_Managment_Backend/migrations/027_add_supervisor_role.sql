-- ============================================================================
-- 027_add_supervisor_role.sql  (UP)
-- Introduce `supervisor` as a distinct role.
--
-- A Supervisor is an academic teacher who may later teach courses and
-- supervise graduation projects. At this stage ONLY the role is introduced:
--
--   * added to the user_role enum
--   * registered in the roles table as ACTIVE
--   * NO permissions are granted (no supervisor-specific functionality yet)
--
-- The `department_manager` role stays reserved for Department Heads and is
-- NOT used for supervisor accounts anymore. Any supervisor accounts created
-- through the supervisors module now get role = 'supervisor'.
--
-- NOTE: PostgreSQL forbids USING a value added via ALTER TYPE ... ADD VALUE
-- within the same transaction. This migration only adds the enum value and a
-- roles row — it does not insert any user rows, so the transaction-wrapped
-- runner (scripts/run-migrations.ts) is safe.
--
-- Dependencies: 001 (enum), 017 (roles table)
-- DOWN: 027_add_supervisor_role.down.sql
-- ============================================================================
BEGIN;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor';

INSERT INTO roles (code, name_ar, name_en, description)
VALUES (
  'supervisor',
  'مشرف أكاديمي',
  'Supervisor',
  'Academic supervisor/teacher. Role only — no permissions assigned yet.'
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
