-- ============================================================================
-- 017_rbac_permissions.down.sql
-- Removes the RBAC tables, audit trail, and the users.token_version column.
-- ============================================================================
BEGIN;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_warehouses;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;

ALTER TABLE users DROP COLUMN IF EXISTS token_version;

COMMIT;
