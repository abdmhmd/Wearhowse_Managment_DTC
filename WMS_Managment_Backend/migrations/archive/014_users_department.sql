-- Migration 014: department scoping for users
-- Adds department_id to users so department_manager (teacher) accounts can be
-- scoped to a specific department. Optional for all other roles.

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);

COMMENT ON COLUMN users.department_id IS 'Department the user belongs to. Required for department_manager role.';
