import { pool } from '../../config/database';
import { PoolClient } from 'pg';

/**
 * Shared stock-availability overlay.
 *
 * physical_stock  = item_warehouse_stock.current_balance   (source of truth)
 * allocated_open  = SUM(open purchase-order reservations)  (overlay)
 * available_stock = physical_stock - allocated_open        (>= 0 enforced here)
 *
 * This is the SINGLE availability formula for the whole system — consumers
 * must use these helpers instead of re-implementing the join.
 */

export interface StockAvailability {
  item_id: number;
  warehouse_id: number;
  /** Physical balance from item_warehouse_stock. */
  physical_stock: number;
  /** Open reservation quantity across all purchase orders. */
  allocated_stock: number;
  /** physical - allocated, floored at 0 by convention. */
  available_stock: number;
}

const OPEN_ALLOCATIONS_CTE = `
  open_allocations AS (
    SELECT pod.item_id, poa.source_warehouse_id,
           SUM(poa.quantity_allocated - poa.quantity_transferred) AS allocated_qty
    FROM purchase_order_allocations poa
    JOIN purchase_order_details pod ON pod.id = poa.po_detail_id
    WHERE poa.status IN ('allocated', 'partially_transferred')
    GROUP BY pod.item_id, poa.source_warehouse_id
  )
`;

/** Availability for one item in one warehouse (optionally inside a transaction). */
export async function getStockAvailability(
  itemId: number,
  warehouseId: number,
  client?: PoolClient
): Promise<StockAvailability> {
  const q = client ?? pool;
  const res = await q.query(
    `WITH ${OPEN_ALLOCATIONS_CTE}
     SELECT iws.item_id,
            iws.warehouse_id,
            COALESCE(iws.current_balance, 0) AS physical_stock,
            COALESCE(oa.allocated_qty, 0)    AS allocated_stock
     FROM item_warehouse_stock iws
     LEFT JOIN open_allocations oa
       ON oa.item_id = iws.item_id AND oa.source_warehouse_id = iws.warehouse_id
     WHERE iws.item_id = $1 AND iws.warehouse_id = $2`,
    [itemId, warehouseId]
  );
  const row = res.rows[0];
  const physical = Number(row?.physical_stock ?? 0);
  const allocated = Number(row?.allocated_stock ?? 0);
  return {
    item_id: itemId,
    warehouse_id: warehouseId,
    physical_stock: physical,
    allocated_stock: allocated,
    // Reservations can never exceed what physically exists; if historical
    // outflows left open allocations above the balance, availability floors
    // at 0 so callers cannot plan against phantom stock.
    available_stock: Math.max(physical - allocated, 0),
  };
}

/**
 * Availability columns shared by list queries.
 * Usage: `SELECT ..., ${AVAILABILITY_COLUMNS('iws')} FROM ...`
 */
export function availabilityColumns(iwsAlias = 'iws'): string {
  const a = iwsAlias;
  return `${a}.current_balance AS physical_stock,
     COALESCE(oa.allocated_qty, 0) AS allocated_stock,
     GREATEST(COALESCE(${a}.current_balance, 0) - COALESCE(oa.allocated_qty, 0), 0) AS available_stock`;
}

/** JOIN fragment binding the open-allocation CTE to a stock alias named `oa`. */
export function availabilityJoin(itemCol: string, warehouseCol: string): string {
  return `LEFT JOIN open_allocations oa ON oa.item_id = ${itemCol} AND oa.source_warehouse_id = ${warehouseCol}`;
}

/** The CTE text, for queries that select availability via availabilityColumns(). */
export { OPEN_ALLOCATIONS_CTE };
