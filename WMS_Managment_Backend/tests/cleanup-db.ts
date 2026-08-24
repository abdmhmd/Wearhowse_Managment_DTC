import { pool } from '../src/config/database';

/**
 * Deletes all test-created rows (identified by `prefix`) across every
 * transactional table, in child-before-parent order derived from the FK map.
 * Used both by per-suite `cleanup()` in helpers.ts and by the global setup
 * (jest `globalSetup`) that wipes stale `test_%` data before the whole run.
 */
export async function cleanupTestData(prefix: string): Promise<void> {
  const pattern = `${prefix}%`;
  const p = pool;

  await p.query(
    `DELETE FROM journal_entries
      WHERE transaction_id IN (SELECT id FROM transactions
              WHERE transaction_no LIKE $1
                 OR created_by IN (SELECT id FROM users WHERE username LIKE $1)
                 OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
                 OR to_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1))
         OR created_by IN (SELECT id FROM users WHERE username LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM inventory_counts
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR session_id IN (SELECT id FROM inventory_sessions WHERE session_no LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM inventory_sessions
      WHERE session_no LIKE $1
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
         OR started_by IN (SELECT id FROM users WHERE username LIKE $1)
         OR completed_by IN (SELECT id FROM users WHERE username LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM alerts
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
         OR acknowledged_by IN (SELECT id FROM users WHERE username LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM custodies
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR assigned_to IN (SELECT id FROM users WHERE username LIKE $1)
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)`,
    [pattern]
  );
  // Purchase order tables must be cleaned BEFORE transactions (allocations
  // reference them) and BEFORE warehouses/items/users.
  await p.query(
    `DELETE FROM purchase_order_allocations
      WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)
         OR allocated_by IN (SELECT id FROM users WHERE username LIKE $1)
         OR transferred_by IN (SELECT id FROM users WHERE username LIKE $1)
         OR source_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
         OR dest_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
         OR transfer_transaction_id IN (SELECT id FROM transactions WHERE transaction_no LIKE $1)
         OR receive_transaction_id IN (SELECT id FROM transactions WHERE transaction_no LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM purchase_order_details
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM purchase_orders
       WHERE po_number LIKE $1
          OR created_by IN (SELECT id FROM users WHERE username LIKE $1)
          OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
          OR department_id IN (SELECT id FROM departments WHERE code LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM material_request_details
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR request_id IN (SELECT id FROM material_requests WHERE request_no LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM material_requests
      WHERE request_no LIKE $1
         OR requested_by IN (SELECT id FROM users WHERE username LIKE $1)
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
         OR project_id IN (SELECT id FROM projects WHERE name LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM batches
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR transaction_id IN (SELECT id FROM transactions
              WHERE transaction_no LIKE $1
                 OR created_by IN (SELECT id FROM users WHERE username LIKE $1)
                 OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
                 OR to_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1))`,
    [pattern]
  );
  await p.query(
    `DELETE FROM transaction_details
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR transaction_id IN (SELECT id FROM transactions
              WHERE transaction_no LIKE $1
                 OR created_by IN (SELECT id FROM users WHERE username LIKE $1)
                 OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
                 OR to_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1))`,
    [pattern]
  );
  await p.query(
    `DELETE FROM stock_movements
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR transaction_id IN (SELECT id FROM transactions
              WHERE transaction_no LIKE $1
                 OR created_by IN (SELECT id FROM users WHERE username LIKE $1)
                 OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
                 OR to_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1))`,
    [pattern]
  );
  await p.query(
    `DELETE FROM transactions
      WHERE transaction_no LIKE $1
         OR created_by IN (SELECT id FROM users WHERE username LIKE $1)
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)
         OR to_warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM refresh_tokens
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM audit_logs
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM user_warehouses
      WHERE user_id IN (SELECT id FROM users WHERE username LIKE $1)
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM unit_conversions
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM item_warehouse_stock
      WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)
         OR warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)`,
    [pattern]
  );
  await p.query(
    `DELETE FROM projects
      WHERE name LIKE $1
         OR project_no LIKE $1
         OR created_by IN (SELECT id FROM users WHERE username LIKE $1)`,
    [pattern]
  );
  await p.query(`DELETE FROM items WHERE item_code LIKE $1`, [pattern]);
  await p.query(
    `DELETE FROM locations
      WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)`,
    [pattern]
  );
  await p.query(`DELETE FROM warehouses WHERE code LIKE $1`, [pattern]);
  await p.query(`DELETE FROM subcategories WHERE code LIKE $1`, [pattern]);
  await p.query(
    `DELETE FROM categories WHERE parent_code IS NOT NULL AND code LIKE $1`,
    [pattern]
  );
  await p.query(`DELETE FROM categories WHERE code LIKE $1`, [pattern]);
  await p.query(`DELETE FROM units WHERE code LIKE $1`, [pattern]);
  await p.query(
    `DELETE FROM suppliers WHERE name_ar LIKE $1 OR name_en LIKE $1`,
    [pattern]
  );
  await p.query(`DELETE FROM departments WHERE code LIKE $1`, [pattern]);
  await p.query(`DELETE FROM users WHERE username LIKE $1`, [pattern]);
}
