-- Migration 004: Hierarchical Categories
-- Adds parent_code to support tree-structured category classification

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS parent_code VARCHAR(50) REFERENCES categories(code) ON DELETE SET NULL;

COMMENT ON COLUMN categories.parent_code IS 'Self-reference for hierarchical category tree. NULL means root category.';
