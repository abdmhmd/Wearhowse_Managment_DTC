-- ============================================================================
-- 023_project_management_workflow.sql  (UP)
-- Graduation Project management workflow.
--
-- Business rules implemented:
--   * warehouse_manager becomes the project owner: can CREATE projects for
--     their department's warehouse, update them, complete/cancel them, and
--     manage the borrowed materials (assign existing Items to a project and
--     process their return). department_manager stays VIEW-ONLY on projects
--     (permissions were revoked in migration 019); system_admin is unchanged.
--   * projects gain a department-warehouse link (warehouse_id) plus metadata:
--     academic_year, description, start_date, expected_completion_date.
--   * project lifecycle extended with 'cancelled' (open=active, closed=completed).
--   * project_students: free-text student roster (students are NOT system
--     accounts — names/ids/roles are stored directly).
--   * custodies (borrowed materials) gain expected_return_at + a return
--     condition and the 'damaged' / 'lost' lifecycle states so damaged or lost
--     materials keep their record instead of silently restoring stock.
--
-- ENUM NOTES:
--   * The migration runner wraps each file in BEGIN/COMMIT and the server runs
--     PostgreSQL 12+, so ALTER TYPE ... ADD VALUE works here (the new values
--     are not USED inside this same transaction).
--   * DOWN cannot remove enum values without recreating the types; the .down
--     file reverts grants/columns/table and documents that limitation.
--
-- Dependencies: 001, 017, 018, 019
-- DOWN: 023_project_management_workflow.down.sql
-- ============================================================================
BEGIN;

-- 1. warehouse_manager: project ownership + custody returns --------------------
WITH matrix(code, perm) AS (VALUES
  ('warehouse_manager', 'projects:create'),
  ('warehouse_manager', 'projects:update'),
  ('warehouse_manager', 'projects:close'),
  ('warehouse_manager', 'custodies:return')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. projects: department-warehouse link + metadata ----------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

-- Preserve existing data: point legacy projects at the department's main
-- warehouse (falling back to the first active warehouse of the department).
UPDATE projects p
SET warehouse_id = COALESCE(
  (SELECT w.id FROM warehouses w
    WHERE w.department_id = p.department_id AND w.is_main = true AND w.is_active = true
    ORDER BY w.id LIMIT 1),
  (SELECT w.id FROM warehouses w
    WHERE w.department_id = p.department_id AND w.is_active = true
    ORDER BY w.id LIMIT 1)
)
WHERE p.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_warehouse ON projects(warehouse_id);

-- 3. Project lifecycle: add 'cancelled' ----------------------------------------
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 4. project_students (free-text roster; students are not system users) --------
CREATE TABLE IF NOT EXISTS project_students (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    full_name  VARCHAR(255) NOT NULL,
    student_id VARCHAR(50),
    role       VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_students_project ON project_students(project_id);

-- 5. custodies (borrowed materials): return condition + damaged/lost states ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custody_condition') THEN
    CREATE TYPE custody_condition AS ENUM ('good', 'damaged', 'lost');
  END IF;
END $$;

ALTER TABLE custodies
  ADD COLUMN IF NOT EXISTS expected_return_at DATE,
  ADD COLUMN IF NOT EXISTS condition custody_condition NOT NULL DEFAULT 'good';

ALTER TYPE custody_status ADD VALUE IF NOT EXISTS 'damaged';
ALTER TYPE custody_status ADD VALUE IF NOT EXISTS 'lost';

CREATE INDEX IF NOT EXISTS idx_custodies_warehouse_status ON custodies(warehouse_id, status);

COMMIT;
