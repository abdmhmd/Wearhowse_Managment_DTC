-- ============================================================================
-- 021_add_stock_movement_warehouse.sql  (UP)
-- Goal: attribute every stock movement to the warehouse where it PHYSICALLY
-- happened. stock_movements had no warehouse_id, so all movement scoping had
-- to guess the warehouse from the ITEM's home warehouse (i.warehouse_id),
-- which:
--   * leaks a warehouse's movements to managers of a different warehouse that
--     merely stocks the same item, and
--   * made the inventory report crash for scoped users (the report filtered on
--     sm.warehouse_id which did not exist yet).
--
-- The backfill derives the TRUE movement warehouse from the parent
-- transaction, never from the item's home warehouse:
--   * RV / RTI / ADJ / RTV : single-sided -> transactions.warehouse_id
--   * TRF                   : OUT -> transactions.warehouse_id (source),
--                              IN  -> transactions.to_warehouse_id (dest)
--   * LN via material-request issue : OUT leg originates from the department's
--     MAIN warehouse; IN leg lands in the requesting department warehouse
--     (transactions.warehouse_id). We detect the OUT leg of an issued LN by a
--     paired IN movement for the same item within the same LN.
--   * manual LN (single-sided) : transactions.warehouse_id
--   * safety net: any remaining NULL uses transactions.warehouse_id.
--
-- Dependencies: 020 (warehouses.is_main / warehouses.department_id)
-- DOWN: 021_add_stock_movement_warehouse.down.sql
-- ============================================================================
BEGIN;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS warehouse_id INT;

-- 1. RV / RTI / ADJ / RTV : single-sided movements use the header warehouse.
UPDATE stock_movements sm
SET warehouse_id = t.warehouse_id
FROM transactions t
WHERE sm.transaction_id = t.id
  AND sm.warehouse_id IS NULL
  AND t.type IN ('RV', 'RTI', 'ADJ', 'RTV');

-- 2. TRF: OUT from the source warehouse, IN to the destination warehouse.
UPDATE stock_movements sm
SET warehouse_id = t.warehouse_id
FROM transactions t
WHERE sm.transaction_id = t.id
  AND t.type = 'TRF'
  AND sm.movement_type = 'OUT'
  AND sm.warehouse_id IS NULL;

UPDATE stock_movements sm
SET warehouse_id = t.to_warehouse_id
FROM transactions t
WHERE sm.transaction_id = t.id
  AND t.type = 'TRF'
  AND sm.movement_type = 'IN'
  AND sm.warehouse_id IS NULL;

-- 3. LN: IN movements land in the requesting department warehouse.
UPDATE stock_movements sm
SET warehouse_id = t.warehouse_id
FROM transactions t
WHERE sm.transaction_id = t.id
  AND t.type = 'LN'
  AND sm.movement_type = 'IN'
  AND sm.warehouse_id IS NULL;

-- 3b. LN OUT legs that have a paired IN leg (material-request issue) come from
--     the department's MAIN warehouse. Fall back to the header warehouse if no
--     active main warehouse is configured for the department.
UPDATE stock_movements sm
SET warehouse_id = COALESCE(
  (SELECT m.id
     FROM warehouses m
    WHERE m.department_id = t.department_id
      AND m.is_main = true
      AND m.is_active = true
    ORDER BY m.id
    LIMIT 1),
  t.warehouse_id)
FROM transactions t
WHERE sm.transaction_id = t.id
  AND t.type = 'LN'
  AND sm.movement_type = 'OUT'
  AND sm.warehouse_id IS NULL
  AND EXISTS (
    SELECT 1 FROM stock_movements sm2
    WHERE sm2.transaction_id = sm.transaction_id
      AND sm2.item_id = sm.item_id
      AND sm2.movement_type = 'IN'
  );

-- 3c. Remaining LN OUT legs (manual single-sided LN): the header warehouse.
UPDATE stock_movements sm
SET warehouse_id = t.warehouse_id
FROM transactions t
WHERE sm.transaction_id = t.id
  AND t.type = 'LN'
  AND sm.movement_type = 'OUT'
  AND sm.warehouse_id IS NULL;

-- 4. Safety net: any movement still un-attributed uses the header warehouse.
UPDATE stock_movements sm
SET warehouse_id = t.warehouse_id
FROM transactions t
WHERE sm.transaction_id = t.id
  AND sm.warehouse_id IS NULL;

-- Foreign key + index. warehouse_id stays nullable: FK semantics permit NULL
-- and we never want to block inserts in the transaction path.
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_stock_movements_warehouse
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse
  ON stock_movements (warehouse_id);

COMMIT;
