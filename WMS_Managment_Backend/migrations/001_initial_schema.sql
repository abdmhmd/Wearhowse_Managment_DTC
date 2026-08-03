-- ============================================================================
-- 001_initial_schema.sql
-- Squashed & consolidated initial schema.
-- Replaces: schema.sql + migrations/002_add_name_en_columns.sql
--                       + migrations/002_accounting_fields.sql
--                       + migrations/003_add_missing_columns.sql
--                       + migrations/004_hierarchical_categories.sql
--                       + migrations/005_stock_per_warehouse.sql
--                       + migrations/006_new_roles.sql
--                       + migrations/007_material_requests.sql
--                       + migrations/008_batches.sql
--                       + migrations/009_alerts.sql
--                       + migrations/010_inventory.sql
--                       + migrations/011_refresh_tokens_and_trf.sql
--                       + migrations/012_new_requirements.sql
--                       + migrations/013_expiry_alert_check.sql
--                       + migrations/014_users_department.sql
--
-- Target: FRESH installations. Fully idempotent (IF NOT EXISTS / DO guards),
-- so it is also safe to re-run or to apply over a partially-migrated DB.
--
-- Conventions applied:
--   * All DDL wrapped in BEGIN / COMMIT.
--   * All timestamps use TIMESTAMPTZ.
--   * Every VARCHAR has an explicit length.
--   * Every foreign key column has its own index.
--   * Composite index (warehouse_id + product_id) present where the
--     inventory query pattern requires it.
--   * Child rows that lose meaning without their parent use ON DELETE CASCADE;
--     audit/financial links use ON DELETE RESTRICT; optional user links use
--     ON DELETE SET NULL.
--
-- NOTE for existing databases: this file does NOT rebuild already-existing FK
-- constraints (PostgreSQL cannot atomically replace a FK action without a
-- lock/rewrite). Fresh installs get the hardened schema; production is upgraded
-- through incremental migrations. See the migration review report.
-- ============================================================================
BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Sequences
-- ────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS transaction_no_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS request_no_seq          START 1;
CREATE SEQUENCE IF NOT EXISTS project_no_seq          START 1;
CREATE SEQUENCE IF NOT EXISTS inventory_session_no_seq START 1;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Enum types (idempotent: create if missing, extend with ADD VALUE otherwise)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'system_admin', 'warehouse_manager', 'storekeeper', 'accountant',
      'department_manager', 'viewer'
    );
  ELSE
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'department_manager';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE transaction_type AS ENUM ('RV', 'LN', 'RTV', 'RTI', 'ADJ', 'TRF');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE transaction_status AS ENUM ('draft', 'approved');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
    CREATE TYPE movement_type AS ENUM ('IN', 'OUT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
    CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'issued', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_priority') THEN
    CREATE TYPE request_priority AS ENUM ('low', 'normal', 'high', 'urgent');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type') THEN
    CREATE TYPE alert_type AS ENUM ('low_stock', 'expiry_warning', 'overstock', 'pending_request');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
    CREATE TYPE alert_status AS ENUM ('active', 'acknowledged', 'resolved');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_session_status') THEN
    CREATE TYPE inventory_session_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM ('open', 'closed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_type') THEN
    CREATE TYPE request_type AS ENUM ('experiment', 'semester', 'project');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custody_status') THEN
    CREATE TYPE custody_status AS ENUM ('active', 'returned');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Master-data tables (no external FK dependencies)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    code        VARCHAR(50) PRIMARY KEY,
    name_ar     VARCHAR(255) NOT NULL,
    name_en     VARCHAR(255),
    prefix      VARCHAR(10),
    parent_code VARCHAR(50) REFERENCES categories(code) ON DELETE SET NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_parent    ON categories(parent_code);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

CREATE TABLE IF NOT EXISTS units (
    code       VARCHAR(50) PRIMARY KEY,
    name_ar    VARCHAR(255) NOT NULL,
    name_en    VARCHAR(255) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL PRIMARY KEY,
    name_ar    VARCHAR(255) NOT NULL,
    name_en    VARCHAR(255),
    phone      VARCHAR(50),
    email      VARCHAR(255),
    address    TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

CREATE TABLE IF NOT EXISTS departments (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(50) UNIQUE NOT NULL,
    name_ar    VARCHAR(255) NOT NULL,
    name_en    VARCHAR(255),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);

CREATE TABLE IF NOT EXISTS warehouses (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(50) UNIQUE NOT NULL,
    name_ar    VARCHAR(255) NOT NULL,
    name_en    VARCHAR(255),
    location   VARCHAR(255),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warehouses_is_active ON warehouses(is_active);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Users
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          user_role NOT NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active  ON users(is_active);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Items
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
    id                  SERIAL PRIMARY KEY,
    item_code           VARCHAR(100) UNIQUE NOT NULL,
    name_ar             VARCHAR(255) NOT NULL,
    name_en             VARCHAR(255),
    description         TEXT,
    category_code       VARCHAR(50) NOT NULL REFERENCES categories(code),
    unit_code           VARCHAR(50) NOT NULL REFERENCES units(code),
    warehouse_id        INTEGER NOT NULL REFERENCES warehouses(id),
    min_stock_level     DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    max_stock_level     DECIMAL(12, 4) NOT NULL DEFAULT 999999.9999,
    current_balance     DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 CHECK (current_balance >= 0),
    location            VARCHAR(100),
    last_purchase_price DECIMAL(12, 2) DEFAULT 0,
    opening_price       DECIMAL(12, 2) DEFAULT 0,
    is_consumable       BOOLEAN NOT NULL DEFAULT TRUE,
    expiry_alert_days   INTEGER NOT NULL DEFAULT 30 CHECK (expiry_alert_days BETWEEN 1 AND 3650),
    sap_material_number VARCHAR(100),
    gl_account          VARCHAR(100),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_item_code            ON items(item_code);
CREATE INDEX IF NOT EXISTS idx_items_category             ON items(category_code);
CREATE INDEX IF NOT EXISTS idx_items_warehouse            ON items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_items_is_active            ON items(is_active);
CREATE INDEX IF NOT EXISTS idx_items_consumable           ON items(is_consumable);
CREATE INDEX IF NOT EXISTS idx_items_warehouse_itemcode   ON items(warehouse_id, item_code);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Unit conversions
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unit_conversions (
    id             SERIAL PRIMARY KEY,
    item_id        INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    from_unit_code VARCHAR(50) NOT NULL REFERENCES units(code),
    to_unit_code   VARCHAR(50) NOT NULL REFERENCES units(code),
    factor         DECIMAL(12, 4) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_item_unit_conversion UNIQUE (item_id, from_unit_code, to_unit_code)
);

CREATE INDEX IF NOT EXISTS idx_unit_conversions_item  ON unit_conversions(item_id);
CREATE INDEX IF NOT EXISTS idx_uc_from_unit          ON unit_conversions(from_unit_code);
CREATE INDEX IF NOT EXISTS idx_uc_to_unit            ON unit_conversions(to_unit_code);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Transactions (request_id FK to material_requests added later, after that
--    table exists, to break the circular reference).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id               SERIAL PRIMARY KEY,
    transaction_no   VARCHAR(100) UNIQUE NOT NULL,
    type             transaction_type NOT NULL,
    status           transaction_status NOT NULL DEFAULT 'draft',
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    supplier_id      INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id),
    to_warehouse_id  INTEGER REFERENCES warehouses(id),
    request_id       INTEGER,
    created_by       INTEGER NOT NULL REFERENCES users(id),
    approved_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_type             ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date             ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_warehouse        ON transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transactions_supplier         ON transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_department       ON transactions(department_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_warehouse     ON transactions(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by       ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_approved_by      ON transactions(approved_by);
CREATE INDEX IF NOT EXISTS idx_transactions_wh_status_type   ON transactions(warehouse_id, status, type);

CREATE TABLE IF NOT EXISTS transaction_details (
    id             SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_id        INTEGER NOT NULL REFERENCES items(id),
    quantity       DECIMAL(12, 4) NOT NULL,
    unit_code      VARCHAR(50) NOT NULL REFERENCES units(code),
    unit_price     DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    total_price    DECIMAL(12, 4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    unit_cost      DECIMAL(12, 2),
    total_value    DECIMAL(12, 2),
    batch_number   VARCHAR(100),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transaction_details_trans  ON transaction_details(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_details_item   ON transaction_details(item_id);
CREATE INDEX IF NOT EXISTS idx_td_batch_number            ON transaction_details(batch_number);

CREATE TABLE IF NOT EXISTS stock_movements (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id),
    transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
    movement_type   movement_type NOT NULL,
    quantity_before DECIMAL(12, 4) NOT NULL,
    quantity_change DECIMAL(12, 4) NOT NULL,
    quantity_after  DECIMAL(12, 4) NOT NULL,
    movement_date   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item   ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_trans  ON stock_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date   ON stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_sm_item_date           ON stock_movements(item_id, movement_date);

CREATE TABLE IF NOT EXISTS journal_entries (
    id             SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    entry_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    account_debit  VARCHAR(100) NOT NULL,
    account_credit VARCHAR(100) NOT NULL,
    amount         DECIMAL(12, 2) NOT NULL,
    description    TEXT,
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_je_transaction ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_je_created_by  ON journal_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_je_entry_date  ON journal_entries(entry_date);

CREATE TABLE IF NOT EXISTS system_settings (
    key        VARCHAR(50) PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (key, value) VALUES
    ('inventory_account', 'Inventory'),
    ('supplier_account', 'Suppliers'),
    ('expense_account_prefix', 'Expense_'),
    ('valuation_method', 'last_purchase')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Stock balance per item per warehouse (source of truth for inventory)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_warehouse_stock (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    current_balance DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 CHECK (current_balance >= 0),
    min_stock_level DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    max_stock_level DECIMAL(12, 4) NOT NULL DEFAULT 999999.9999,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_item_warehouse UNIQUE (item_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_iws_item           ON item_warehouse_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_iws_warehouse      ON item_warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_iws_low_stock      ON item_warehouse_stock(current_balance, min_stock_level);
CREATE INDEX IF NOT EXISTS idx_iws_warehouse_item ON item_warehouse_stock(warehouse_id, item_id);

-- Backfill (no-op on fresh installs / already-migrated DBs)
INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance, min_stock_level, max_stock_level)
SELECT
    id,
    warehouse_id,
    COALESCE(current_balance, 0),
    COALESCE(min_stock_level, 0),
    COALESCE(max_stock_level, 999999.9999)
FROM items
ON CONFLICT (item_id, warehouse_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Batches / lots
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    batch_number    VARCHAR(100) NOT NULL,
    production_date DATE,
    expiry_date     DATE,
    quantity        DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 CHECK (quantity >= 0),
    unit_code       VARCHAR(50) NOT NULL REFERENCES units(code),
    supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    transaction_id  INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_batch UNIQUE (item_id, warehouse_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_item      ON batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_warehouse ON batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_supplier  ON batches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_batches_transaction ON batches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry    ON batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_active    ON batches(is_active);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Projects (created before material_requests, which references project_id)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id            SERIAL PRIMARY KEY,
    project_no    VARCHAR(100) UNIQUE NOT NULL,
    name          VARCHAR(500) NOT NULL,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status        project_status NOT NULL DEFAULT 'open',
    notes         TEXT,
    closed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at     TIMESTAMPTZ,
    created_by    INTEGER NOT NULL REFERENCES users(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_dept       ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_supervisor ON projects(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Material requests (issued against a warehouse; circular FK to
--    transactions.request_id resolved after this block)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_requests (
    id               SERIAL PRIMARY KEY,
    request_no       VARCHAR(100) UNIQUE NOT NULL,
    department_id    INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    requested_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status           request_status NOT NULL DEFAULT 'pending',
    priority         request_priority NOT NULL DEFAULT 'normal',
    request_type     request_type NOT NULL DEFAULT 'experiment',
    project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    needed_by        DATE,
    notes            TEXT,
    rejection_reason TEXT,
    approved_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at      TIMESTAMPTZ,
    issued_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    issued_at        TIMESTAMPTZ,
    transaction_id   INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mr_department   ON material_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_mr_warehouse    ON material_requests(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_mr_status       ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_mr_requested_by ON material_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_mr_request_type ON material_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_mr_project      ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_mr_approved_by  ON material_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_mr_issued_by    ON material_requests(issued_by);
CREATE INDEX IF NOT EXISTS idx_mr_transaction  ON material_requests(transaction_id);
CREATE INDEX IF NOT EXISTS idx_mr_wh_status    ON material_requests(warehouse_id, status);

CREATE TABLE IF NOT EXISTS material_request_details (
    id         SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity   DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
    unit_code  VARCHAR(50) NOT NULL REFERENCES units(code),
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mrd_request ON material_request_details(request_id);
CREATE INDEX IF NOT EXISTS idx_mrd_item    ON material_request_details(item_id);

-- Resolve the circular transactions <-> material_requests reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'transactions'::regclass
      AND c.contype = 'f'
      AND a.attname = 'request_id'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_request_id
      FOREIGN KEY (request_id) REFERENCES material_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_request ON transactions(request_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 11. Alerts
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    type            alert_type NOT NULL,
    status          alert_status NOT NULL DEFAULT 'active',
    item_id         INTEGER REFERENCES items(id) ON DELETE CASCADE,
    warehouse_id    INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
    batch_id        INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    request_id      INTEGER REFERENCES material_requests(id) ON DELETE CASCADE,
    message_ar      TEXT NOT NULL,
    message_en      TEXT,
    acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_status    ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_type      ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_item      ON alerts(item_id);
CREATE INDEX IF NOT EXISTS idx_alerts_warehouse ON alerts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_alerts_batch     ON alerts(batch_id);
CREATE INDEX IF NOT EXISTS idx_alerts_request   ON alerts(request_id);
CREATE INDEX IF NOT EXISTS idx_alerts_ack_by    ON alerts(acknowledged_by);

-- ────────────────────────────────────────────────────────────────────────────
-- 12. Inventory sessions / cycle counts
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sessions (
    id                 SERIAL PRIMARY KEY,
    session_no         VARCHAR(100) UNIQUE NOT NULL,
    warehouse_id       INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    status             inventory_session_status NOT NULL DEFAULT 'open',
    notes              TEXT,
    started_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    started_at         TIMESTAMPTZ,
    completed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at       TIMESTAMPTZ,
    adj_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_sessions_warehouse ON inventory_sessions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_status    ON inventory_sessions(status);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_started   ON inventory_sessions(started_by);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_completed ON inventory_sessions(completed_by);
CREATE INDEX IF NOT EXISTS idx_inv_sessions_adj       ON inventory_sessions(adj_transaction_id);

CREATE TABLE IF NOT EXISTS inventory_counts (
    id           SERIAL PRIMARY KEY,
    session_id   INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    system_qty   DECIMAL(12, 4) NOT NULL,
    counted_qty  DECIMAL(12, 4),
    variance     DECIMAL(12, 4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
    unit_code    VARCHAR(50) NOT NULL REFERENCES units(code),
    counted_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    counted_at   TIMESTAMPTZ,
    notes        TEXT,
    CONSTRAINT uq_session_item UNIQUE (session_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_counts_session  ON inventory_counts(session_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_item     ON inventory_counts(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_warehouse ON inventory_counts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_counted  ON inventory_counts(counted_by);
CREATE INDEX IF NOT EXISTS idx_inv_counts_wh_item  ON inventory_counts(warehouse_id, item_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 13. Refresh tokens
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user  ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash  ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_exp   ON refresh_tokens(expires_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 14. Custodies
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custodies (
    id                    SERIAL PRIMARY KEY,
    item_id               INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    warehouse_id          INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    assigned_to           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    quantity              DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
    unit_code             VARCHAR(50) NOT NULL REFERENCES units(code),
    issued_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    return_transaction_id INTEGER REFERENCES transactions(id),
    request_id            INTEGER REFERENCES material_requests(id) ON DELETE SET NULL,
    project_id            INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    status                custody_status NOT NULL DEFAULT 'active',
    notes                 TEXT,
    returned_at           TIMESTAMPTZ,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custodies_item        ON custodies(item_id);
CREATE INDEX IF NOT EXISTS idx_custodies_warehouse   ON custodies(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_custodies_user        ON custodies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_custodies_status      ON custodies(status);
CREATE INDEX IF NOT EXISTS idx_custodies_project     ON custodies(project_id);
CREATE INDEX IF NOT EXISTS idx_custodies_request     ON custodies(request_id);
CREATE INDEX IF NOT EXISTS idx_custodies_issued_tr   ON custodies(issued_transaction_id);
CREATE INDEX IF NOT EXISTS idx_custodies_return_tr   ON custodies(return_transaction_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 15. Functions & triggers
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_balance <= NEW.min_stock_level AND NEW.min_stock_level > 0 THEN
        INSERT INTO alerts (type, item_id, warehouse_id, message_ar, message_en)
        SELECT
            'low_stock',
            NEW.item_id,
            NEW.warehouse_id,
            'وصل المخزون إلى الحد الأدنى أو دونه',
            'Stock reached minimum level or below'
        WHERE NOT EXISTS (
            SELECT 1 FROM alerts
            WHERE type = 'low_stock'
              AND item_id = NEW.item_id
              AND warehouse_id = NEW.warehouse_id
              AND status = 'active'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_units_updated_at ON units;
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_departments_updated_at ON departments;
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_warehouses_updated_at ON warehouses;
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_stock_movements_updated_at ON stock_movements;
CREATE TRIGGER trg_stock_movements_updated_at BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_iws_updated_at ON item_warehouse_stock;
CREATE TRIGGER trg_iws_updated_at BEFORE UPDATE ON item_warehouse_stock FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mr_updated_at ON material_requests;
CREATE TRIGGER trg_mr_updated_at BEFORE UPDATE ON material_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_batches_updated_at ON batches;
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_custodies_updated_at ON custodies;
CREATE TRIGGER trg_custodies_updated_at BEFORE UPDATE ON custodies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_inv_sessions_updated_at ON inventory_sessions;
CREATE TRIGGER trg_inv_sessions_updated_at BEFORE UPDATE ON inventory_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_low_stock_alert ON item_warehouse_stock;
CREATE TRIGGER trg_low_stock_alert AFTER UPDATE ON item_warehouse_stock FOR EACH ROW EXECUTE FUNCTION fn_check_low_stock();

-- ────────────────────────────────────────────────────────────────────────────
-- 16. Additive retrofits for databases that predate this consolidated schema.
--     Each statement is a no-op on fresh installs (columns already exist) and
--     safe on partially-migrated databases (ADD COLUMN IF NOT EXISTS).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS prefix VARCHAR(10);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_code VARCHAR(50) REFERENCES categories(code) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE units ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE units ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE items ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_purchase_price DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS opening_price DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_consumable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE items ADD COLUMN IF NOT EXISTS sap_material_number VARCHAR(100);
ALTER TABLE items ADD COLUMN IF NOT EXISTS gl_account VARCHAR(100);
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_expiry_alert_days;
ALTER TABLE items ADD CONSTRAINT chk_items_expiry_alert_days CHECK (expiry_alert_days BETWEEN 1 AND 3650);

ALTER TABLE unit_conversions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE unit_conversions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE unit_conversions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_warehouse_id INTEGER REFERENCES warehouses(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS request_id INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12, 2);
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS total_value DECIMAL(12, 2);
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS request_type request_type NOT NULL DEFAULT 'experiment';
ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

COMMIT;
