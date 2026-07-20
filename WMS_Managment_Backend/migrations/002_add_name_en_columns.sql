-- Migration 002: Add name_en columns for bilingual support
-- Only units already has name_en; add it to all other master data tables.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS name_en VARCHAR(255);
