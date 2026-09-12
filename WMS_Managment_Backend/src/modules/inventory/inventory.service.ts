import { pool, runInTransaction } from '../../config/database';
import { transactionsService } from '../transactions/transactions.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/AppError';
import { PERMISSIONS } from '../authorization/permissions';
import type { AuthUserContext } from '../authorization/authorization.service';

export class InventoryService {

  async openSession(warehouseId: number, startedBy: number, notes?: string) {
    return runInTransaction(async (client) => {
      // Lock warehouse row to prevent concurrent session creation race conditions
      const whCheck = await client.query(
        `SELECT id FROM warehouses WHERE id = $1 FOR UPDATE`,
        [warehouseId]
      );
      if (whCheck.rows.length === 0) {
        throw new NotFoundError('Warehouse', 'WAREHOUSE_NOT_FOUND', { id: warehouseId });
      }

      // Check no open or in_progress session for this warehouse
      const existing = await client.query(
        `SELECT id FROM inventory_sessions WHERE warehouse_id = $1 AND status IN ('open', 'in_progress')`,
        [warehouseId]
      );
      if (existing.rows.length > 0) {
        throw new ValidationError(
          'There is already an open inventory session for this warehouse',
          { session_id: existing.rows[0].id }
        );
      }

      // Generate session number
      const seqRes = await client.query("SELECT nextval('inventory_session_no_seq') AS seq");
      const sessionNo = `INV-${new Date().getFullYear()}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;

      // Create session
      const sessionRes = await client.query(
        `INSERT INTO inventory_sessions (session_no, warehouse_id, status, started_by, started_at, notes)
         VALUES ($1, $2, 'in_progress', $3, NOW(), $4) RETURNING *`,
        [sessionNo, warehouseId, startedBy, notes ?? null]
      );
      const session = sessionRes.rows[0];

      // Snapshot all active items in this warehouse with their current balances
      await client.query(
        `INSERT INTO inventory_counts (session_id, item_id, warehouse_id, system_qty, unit_code)
         SELECT $1, iws.item_id, iws.warehouse_id, iws.current_balance, i.unit_code
         FROM item_warehouse_stock iws
         JOIN items i ON i.id = iws.item_id
         WHERE iws.warehouse_id = $2 AND i.is_active = true`,
        [session.id, warehouseId]
      );

      const countRes = await client.query(
        'SELECT COUNT(*)::int AS total FROM inventory_counts WHERE session_id = $1',
        [session.id]
      );

      return { ...session, items_count: countRes.rows[0].total };
    });
  }

  async getSession(sessionId: number) {
    const res = await pool.query(
      `SELECT s.*,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              u.full_name AS started_by_name,
              cu.full_name AS completed_by_name
       FROM inventory_sessions s
       JOIN warehouses w ON w.id = s.warehouse_id
       LEFT JOIN users u ON u.id = s.started_by
       LEFT JOIN users cu ON cu.id = s.completed_by
       WHERE s.id = $1`,
      [sessionId]
    );
    if (!res.rows[0]) throw new NotFoundError('InventorySession', 'SESSION_NOT_FOUND', { id: sessionId });

    const countsRes = await pool.query(
      `SELECT ic.*,
              i.item_code, i.name_ar AS item_name_ar,
              u.name_ar AS unit_name_ar
       FROM inventory_counts ic
       JOIN items i ON i.id = ic.item_id
       JOIN units u ON u.code = ic.unit_code
       WHERE ic.session_id = $1
       ORDER BY i.item_code`,
      [sessionId]
    );

    const summary = {
      total_items: countsRes.rows.length,
      counted: countsRes.rows.filter((r: any) => r.counted_qty !== null).length,
      pending: countsRes.rows.filter((r: any) => r.counted_qty === null).length,
      surplus: countsRes.rows.filter((r: any) => r.variance > 0).length,
      deficit: countsRes.rows.filter((r: any) => r.variance < 0).length,
    };

    return { session: res.rows[0], counts: countsRes.rows, summary };
  }

  async recordCount(sessionId: number, itemId: number, countedQty: number, countedBy: number, notes?: string, user?: AuthUserContext) {
    // D10: count recording is allowed for anyone holding inventory:count:record
    // (Admin) OR a sub-warehouse manager recording into one of their own
    // assigned warehouses. Enforcement lives here (Option B) so the route can
    // stay open to sub-warehouse managers without a new permission code.
    let hasRecordPermission = false;
    let isSubManager = false;
    if (user) {
      hasRecordPermission = user.permissions.includes(PERMISSIONS.INVENTORY_COUNT_RECORD);
      isSubManager = user.role === 'sub_warehouse_manager';
      if (!hasRecordPermission && !isSubManager) {
        throw new ForbiddenError('Missing required permission: inventory:count:record');
      }
    }

    // Verify session is active before allowing count modification
    const sessionRes = await pool.query(
      `SELECT status, warehouse_id FROM inventory_sessions WHERE id = $1`,
      [sessionId]
    );
    if (!sessionRes.rows[0]) {
      throw new NotFoundError('InventorySession', 'SESSION_NOT_FOUND', { id: sessionId });
    }

    const status = sessionRes.rows[0].status;
    if (status !== 'open' && status !== 'in_progress') {
      throw new ValidationError(`Cannot record count for a session with status '${status}'`, { status });
    }

    // Sub-warehouse managers are additionally scoped to the session warehouse
    if (user && !hasRecordPermission && !user.warehouse_ids.includes(sessionRes.rows[0].warehouse_id)) {
      throw new ForbiddenError('Missing required permission: inventory:count:record');
    }

    const res = await pool.query(
      `UPDATE inventory_counts
       SET counted_qty = $3, counted_by = $4, counted_at = NOW(), notes = $5
       WHERE session_id = $1 AND item_id = $2
       RETURNING *`,
      [sessionId, itemId, countedQty, countedBy, notes ?? null]
    );
    if (!res.rows[0]) throw new NotFoundError('InventoryCount', 'COUNT_NOT_FOUND', { session_id: sessionId, item_id: itemId });
    return res.rows[0];
  }

  async closeSession(sessionId: number, completedBy: number) {
    return runInTransaction(async (client) => {
      const sessionRes = await client.query(
        `SELECT * FROM inventory_sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );
      const session = sessionRes.rows[0];
      if (!session) throw new NotFoundError('InventorySession', 'SESSION_NOT_FOUND', { id: sessionId });
      if (session.status === 'completed') throw new ValidationError('Session already completed', {});
      if (session.status === 'cancelled') throw new ValidationError('Cannot close a cancelled session', {});

      // Get count of uncounted items
      const uncountedRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM inventory_counts WHERE session_id = $1 AND counted_qty IS NULL`,
        [sessionId]
      );
      const uncountedCount = uncountedRes.rows[0].count;

      // Get all items with variance (counted_qty !== system_qty) along with cost unit_price
      const variances = await client.query(
        `SELECT ic.*, COALESCE(i.last_purchase_price, i.opening_price, 0) AS unit_price
         FROM inventory_counts ic
         JOIN items i ON i.id = ic.item_id
         WHERE ic.session_id = $1 AND ic.counted_qty IS NOT NULL AND ic.variance <> 0`,
        [sessionId]
      );

      let adjTransactionId: number | null = null;

      if (variances.rows.length > 0) {
        // Auto-create ADJ transaction for all variances using resolved item prices
        const adjTransaction = await transactionsService.createDraft(
          {
            type: 'ADJ',
            warehouse_id: session.warehouse_id,
            created_by: completedBy,
            notes: `Auto-adjustment from inventory session ${session.session_no}`,
          },
          variances.rows.map((v: any) => ({
            item_id: v.item_id,
            quantity: parseFloat(v.variance),
            unit_code: v.unit_code,
            unit_price: parseFloat(v.unit_price || 0),
            batch_number: null,
          })),
          client
        );

        await transactionsService.approveTransaction(adjTransaction.id!, completedBy, client);
        adjTransactionId = adjTransaction.id!;
      }

      // Mark session as completed
      await client.query(
        `UPDATE inventory_sessions
         SET status = 'completed', completed_by = $2, completed_at = NOW(), adj_transaction_id = $3
         WHERE id = $1`,
        [sessionId, completedBy, adjTransactionId]
      );

      return {
        message: 'Inventory session closed successfully',
        variances_count: variances.rows.length,
        uncounted_items_count: uncountedCount,
        adj_transaction_id: adjTransactionId,
      };
    });
  }
}

export const inventoryService = new InventoryService();
