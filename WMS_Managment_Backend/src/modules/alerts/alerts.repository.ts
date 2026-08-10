import { pool } from '../../config/database';
import { warehouseAccessClause } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export type AlertType   = 'low_stock' | 'expiry_warning' | 'overstock' | 'pending_request';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export class AlertsRepository {

  async findAll(filters: {
    status?: AlertStatus;
    type?: AlertType;
    warehouse_id?: number;
    limit?: number;
    offset?: number;
    /** Current authenticated user — restricts alerts to their accessible
     *  warehouses (warehouse_manager -> assigned, department_manager ->
     *  department-owned warehouses, system_admin -> all). Alerts without a
     *  warehouse are only visible to a system_admin. */
    user?: AuthUserContext;
  }) {
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let i = 1;

    if (filters.status)      { where += ` AND a.status = $${i++}`;      params.push(filters.status); }
    if (filters.type)        { where += ` AND a.type = $${i++}`;        params.push(filters.type); }
    if (filters.warehouse_id){ where += ` AND a.warehouse_id = $${i++}`;params.push(filters.warehouse_id); }

    if (filters.user) {
      const scope = warehouseAccessClause(filters.user, 'a.warehouse_id', i);
      if (scope.clause !== 'TRUE') {
        where += ` AND ${scope.clause}`;
        params.push(...scope.params);
        i += scope.params.length;
      }
    }

    const limit  = filters.limit  ?? 50;
    const offset = filters.offset ?? 0;

    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT a.*,
                i.item_code, i.name_ar AS item_name_ar,
                w.name_ar AS warehouse_name_ar,
                u.full_name AS acknowledged_by_name
         FROM alerts a
         LEFT JOIN items i ON i.id = a.item_id
         LEFT JOIN warehouses w ON w.id = a.warehouse_id
         LEFT JOIN users u ON u.id = a.acknowledged_by
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM alerts a ${where}`, params),
    ]);

    return { items: listRes.rows, total: countRes.rows[0].total };
  }

  async findSummary(user?: AuthUserContext) {
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let i = 1;

    if (user) {
      const scope = warehouseAccessClause(user, 'warehouse_id', i);
      if (scope.clause !== 'TRUE') {
        where += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }

    const res = await pool.query(
      `SELECT
         type,
         COUNT(*) FILTER (WHERE status = 'active') AS active_count,
         COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged_count
       FROM alerts
       ${where}
       GROUP BY type
       ORDER BY type`,
      params
    );
    return res.rows;
  }

  /**
   * Acknowledges an alert only when it belongs to the current user's
   * warehouse/department scope. Returns null (treated as 404 by the caller)
   * when the alert is outside the scope or already acknowledged.
   */
  async acknowledge(id: number, userId: number, user?: AuthUserContext) {
    let where = 'id = $1 AND status = \'active\'';
    const params: any[] = [id];
    let i = 2;

    if (user) {
      const scope = warehouseAccessClause(user, 'warehouse_id', i);
      if (scope.clause !== 'TRUE') {
        where += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }

    const res = await pool.query(
      `UPDATE alerts
       SET status = 'acknowledged', acknowledged_by = $${i}, acknowledged_at = NOW()
       WHERE ${where}
       RETURNING *`,
      [...params, userId]
    );
    return res.rows[0] || null;
  }

  async resolve(id: number) {
    const res = await pool.query(
      `UPDATE alerts SET status = 'resolved' WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * Check items nearing expiry and create alerts (call daily via scheduled job).
   * The warning window uses each item's own `expiry_alert_days` value instead
   * of a hard-coded global period.
   */
  async generateExpiryAlerts(_warningDays?: number) {
    const res = await pool.query(
      `INSERT INTO alerts (type, item_id, warehouse_id, batch_id, message_ar, message_en)
       SELECT
         'expiry_warning',
         b.item_id,
         b.warehouse_id,
         b.id,
         'دفعة ستنتهي صلاحيتها قريباً: ' || b.batch_number,
         'Batch expiring soon: ' || b.batch_number
       FROM batches b
       JOIN items i ON i.id = b.item_id
       WHERE b.expiry_date IS NOT NULL
         AND b.expiry_date <= NOW() + (i.expiry_alert_days || ' days')::interval
         AND b.expiry_date > NOW()
         AND b.is_active = true
         AND b.quantity > 0
         AND NOT EXISTS (
           SELECT 1 FROM alerts
           WHERE type = 'expiry_warning' AND batch_id = b.id AND status = 'active'
         )
       RETURNING id`
    );
    return res.rows.length;
  }
}

export const alertsRepository = new AlertsRepository();
