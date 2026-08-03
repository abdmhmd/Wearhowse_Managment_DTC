-- Migration 006: New User Roles
-- Adds department_manager and viewer roles to the user_role enum

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'department_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';

COMMENT ON TYPE user_role IS 'system_admin: full access | warehouse_manager: approve & report | storekeeper: execute movements | department_manager: submit requests | accountant: read-only financials | viewer: read-only inventory';
