-- Migration 002: Accounting fields for inventory valuation and journal entries
-- Adds prefix to categories, price fields to items/transaction_details,
-- and creates journal_entries + system_settings tables.

-- 1. Add prefix to categories for smart code generation
ALTER TABLE categories ADD COLUMN IF NOT EXISTS prefix VARCHAR(10);

-- 2. Add price fields to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_purchase_price DECIMAL(12,2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS opening_price DECIMAL(12,2) DEFAULT 0;

-- 3. Add cost/value fields to transaction_details
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2);
ALTER TABLE transaction_details ADD COLUMN IF NOT EXISTS total_value DECIMAL(12,2);

-- 4. Create journal_entries table
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    account_debit VARCHAR(100) NOT NULL,
    account_credit VARCHAR(100) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Insert default accounting settings
INSERT INTO system_settings (key, value) VALUES
('inventory_account', 'Inventory'),
('supplier_account', 'Suppliers'),
('expense_account_prefix', 'Expense_'),
('valuation_method', 'last_purchase')
ON CONFLICT (key) DO NOTHING;

-- 7. Index for code generation performance
CREATE INDEX IF NOT EXISTS idx_items_item_code ON items(item_code);
