-- WMS Database Schema
-- Matches the live Neon PostgreSQL database exactly.
-- Includes migrations 002 (name_en) and 003 (is_active/created_at/updated_at).

-- Drop existing types if they exist
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS transaction_type CASCADE;
DROP TYPE IF EXISTS transaction_status CASCADE;
DROP TYPE IF EXISTS movement_type CASCADE;

-- Create Enums
CREATE TYPE user_role AS ENUM ('system_admin', 'warehouse_manager', 'storekeeper', 'accountant');
CREATE TYPE transaction_type AS ENUM ('RV', 'LN', 'RTV', 'RTI', 'ADJ', 'TRF');
CREATE TYPE transaction_status AS ENUM ('draft', 'approved');
CREATE TYPE movement_type AS ENUM ('IN', 'OUT');

-- Sequence for auto-generated transaction numbers
CREATE SEQUENCE IF NOT EXISTS transaction_no_seq START 1;

-- 1. Categories
CREATE TABLE categories (
    code VARCHAR(50) PRIMARY KEY,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Units
CREATE TABLE units (
    code VARCHAR(50) PRIMARY KEY,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Suppliers
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Departments
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Warehouses
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    location VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Items
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    item_code VARCHAR(100) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    category_code VARCHAR(50) NOT NULL REFERENCES categories(code),
    unit_code VARCHAR(50) NOT NULL REFERENCES units(code),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    min_stock_level DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    max_stock_level DECIMAL(12, 4) NOT NULL DEFAULT 999999.9999,
    current_balance DECIMAL(12, 4) NOT NULL DEFAULT 0.0000 CHECK (current_balance >= 0),
    location VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_items_category ON items(category_code);
CREATE INDEX idx_items_warehouse ON items(warehouse_id);
CREATE INDEX idx_items_is_active ON items(is_active);

-- 8. Unit Conversions
CREATE TABLE unit_conversions (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    from_unit_code VARCHAR(50) NOT NULL REFERENCES units(code),
    to_unit_code VARCHAR(50) NOT NULL REFERENCES units(code),
    factor DECIMAL(12, 4) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_item_unit_conversion UNIQUE (item_id, from_unit_code, to_unit_code)
);
CREATE INDEX idx_unit_conversions_item ON unit_conversions(item_id);

-- 9. Transactions
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    transaction_no VARCHAR(100) UNIQUE NOT NULL,
    type transaction_type NOT NULL,
    status transaction_status NOT NULL DEFAULT 'draft',
    transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    supplier_id INTEGER REFERENCES suppliers(id),
    department_id INTEGER REFERENCES departments(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);

-- 10. Transaction Details
CREATE TABLE transaction_details (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity DECIMAL(12, 4) NOT NULL,
    unit_code VARCHAR(50) NOT NULL REFERENCES units(code),
    unit_price DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    total_price DECIMAL(12, 4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    batch_number VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_transaction_details_trans ON transaction_details(transaction_id);
CREATE INDEX idx_transaction_details_item ON transaction_details(item_id);

-- 11. Stock Movements (Audit Log)
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    movement_type movement_type NOT NULL,
    quantity_before DECIMAL(12, 4) NOT NULL,
    quantity_change DECIMAL(12, 4) NOT NULL,
    quantity_after DECIMAL(12, 4) NOT NULL,
    movement_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX idx_stock_movements_trans ON stock_movements(transaction_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(movement_date);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_stock_movements_updated_at BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
