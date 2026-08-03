-- Migration 012: New Requirements from Meeting Analysis
-- Adds: consumable classification, per-item expiry alerts, SAP fields,
--        projects table, request types, and custodies table.

-- ════════════════════════════════════════════════════════════════════
-- PART 1: Update items table (4 new columns)
-- ════════════════════════════════════════════════════════════════════

-- Consumable vs non-consumable classification
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_consumable BOOLEAN NOT NULL DEFAULT TRUE;

-- Per-item expiry alert threshold (days before expiry)
-- Replaces the previous hard-coded 30-day value
ALTER TABLE items ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_expiry_alert_days;
ALTER TABLE items ADD CONSTRAINT chk_items_expiry_alert_days
  CHECK (expiry_alert_days BETWEEN 1 AND 3650);

-- SAP integration fields (optional, for future use)
ALTER TABLE items ADD COLUMN IF NOT EXISTS sap_material_number VARCHAR(100) NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS gl_account VARCHAR(100) NULL;

COMMENT ON COLUMN items.is_consumable IS 'true = consumable (exits inventory permanently) | false = non-consumable (tracked as custody)';
COMMENT ON COLUMN items.expiry_alert_days IS 'Days before expiry_date to trigger alert. Per-item override of the previous system-wide 30 days.';
COMMENT ON COLUMN items.sap_material_number IS 'SAP Material Number for future ERP integration.';
COMMENT ON COLUMN items.gl_account IS 'General Ledger account code for future SAP integration.';

CREATE INDEX IF NOT EXISTS idx_items_consumable ON items(is_consumable);

-- ════════════════════════════════════════════════════════════════════
-- PART 2: Projects table (new)
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE project_status AS ENUM ('open', 'closed');
CREATE SEQUENCE IF NOT EXISTS project_no_seq START 1;

CREATE TABLE IF NOT EXISTS projects (
    id            SERIAL PRIMARY KEY,
    project_no    VARCHAR(100) UNIQUE NOT NULL,
    name          VARCHAR(500) NOT NULL,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status        project_status NOT NULL DEFAULT 'open',
    notes         TEXT,
    closed_by     INTEGER REFERENCES users(id),
    closed_at     TIMESTAMP,
    created_by    INTEGER NOT NULL REFERENCES users(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_dept       ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_supervisor  ON projects(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);

CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE projects IS 'Graduation/research projects supervised by professors. Tracks multiple material requests under one project number.';

-- ════════════════════════════════════════════════════════════════════
-- PART 3: Update material_requests table
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE request_type AS ENUM ('experiment', 'semester', 'project');

ALTER TABLE material_requests
    ADD COLUMN IF NOT EXISTS request_type request_type NOT NULL DEFAULT 'experiment';

ALTER TABLE material_requests
    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mr_request_type ON material_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_mr_project      ON material_requests(project_id);

COMMENT ON COLUMN material_requests.request_type IS 'experiment = one-time lab | semester = full-term custody | project = multi-drop under project';
COMMENT ON COLUMN material_requests.project_id IS 'Required when request_type = project. References the parent project.';

-- ════════════════════════════════════════════════════════════════════
-- PART 4: Custodies table (new)
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE custody_status AS ENUM ('active', 'returned');

CREATE TABLE IF NOT EXISTS custodies (
    id                     SERIAL PRIMARY KEY,
    item_id                INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    warehouse_id           INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    assigned_to            INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    quantity               DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
    unit_code              VARCHAR(50) NOT NULL REFERENCES units(code),
    issued_transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
    return_transaction_id  INTEGER REFERENCES transactions(id),
    request_id             INTEGER REFERENCES material_requests(id),
    project_id             INTEGER REFERENCES projects(id),
    status                 custody_status NOT NULL DEFAULT 'active',
    notes                  TEXT,
    returned_at            TIMESTAMP,
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custodies_item      ON custodies(item_id);
CREATE INDEX IF NOT EXISTS idx_custodies_user      ON custodies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_custodies_status    ON custodies(status);
CREATE INDEX IF NOT EXISTS idx_custodies_project   ON custodies(project_id);
CREATE INDEX IF NOT EXISTS idx_custodies_warehouse ON custodies(warehouse_id);

CREATE TRIGGER trg_custodies_updated_at
BEFORE UPDATE ON custodies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE custodies IS 'Tracks non-consumable items assigned to users. Created automatically when issuing non-consumable items. Closed when returned via RTI.';
COMMENT ON COLUMN custodies.issued_transaction_id IS 'The LN transaction that originated this custody.';
COMMENT ON COLUMN custodies.return_transaction_id IS 'The RTI transaction created when the custody is returned.';
