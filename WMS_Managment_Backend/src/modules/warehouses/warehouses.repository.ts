import { pool } from '../../config/database';
import { warehouseAccessClause } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export class WarehousesRepository {
  findAll(limit?: number, offset?: number, user?: AuthUserContext) {
    let query = 'SELECT id, code, name_ar, name_en, location, is_main, department_id, created_at, updated_at FROM warehouses WHERE is_active = true';
    const params: any[] = [];
    let paramIndex = 1;

    if (user) {
      const scope = warehouseAccessClause(user, 'id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
    }

    query += ' ORDER BY code';
    if (limit !== undefined && offset !== undefined) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }
    return pool.query(query, params).then(r => r.rows);
  }

  countAll(user?: AuthUserContext) {
    let query = 'SELECT COUNT(*)::int AS total FROM warehouses WHERE is_active = true';
    const params: any[] = [];
    if (user) {
      const scope = warehouseAccessClause(user, 'id', 1);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }
    return pool.query(query, params).then(r => r.rows[0].total);
  }

  /**
   * Fetches a single warehouse by id, restricted to the current user's scope.
   * - system_admin sees every warehouse (GLOBAL).
   * - warehouse_manager sees only their explicitly assigned warehouses.
   * - department_manager sees warehouses owned by their department plus any
   *   warehouses they are explicitly assigned to.
   * - Any other (deactivated) role resolves to NONE and can read nothing.
   * A user outside the scope gets `null` (treated as 404 by the controller).
   */
  async findById(id: number, user?: AuthUserContext) {
    let query = 'SELECT id, code, name_ar, name_en, location, is_main, department_id, created_at, updated_at FROM warehouses WHERE id = $1 AND is_active = true';
    const params: any[] = [id];

    if (user) {
      const scope = warehouseAccessClause(user, 'id', 2);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }

    const res = await pool.query(query, params);
    return res.rows[0] || null;
  }

  create(data: { code: string; name_ar: string; name_en?: string; location?: string; is_main?: boolean; department_id?: number | null }) {
    return pool.query(
      `INSERT INTO warehouses (code, name_ar, name_en, location, is_main, department_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.code, data.name_ar, data.name_en ?? null, data.location ?? null, data.is_main ?? false, data.department_id ?? null]
    ).then(r => r.rows[0]);
  }

  async update(id: number, data: { code?: string; name_ar?: string; name_en?: string; location?: string; is_main?: boolean; department_id?: number | null }) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map(k => (data as any)[k]);
    const res = await pool.query(
      `UPDATE warehouses SET ${setClauses.join(', ')} WHERE id = $1 AND is_active = true RETURNING *`,
      [id, ...values]
    );
    return res.rows[0] || null;
  }

  delete(id: number) {
    return pool.query('UPDATE warehouses SET is_active = false WHERE id = $1 AND is_active = true RETURNING *', [id])
      .then(r => r.rows[0] || null);
  }

  /** The main (default) warehouse of a department, if one has been marked. */
  async findMainByDepartment(departmentId: number) {
    return pool.query(
      'SELECT id, code, name_ar, name_en FROM warehouses WHERE department_id = $1 AND is_main = true AND is_active = true ORDER BY id LIMIT 1',
      [departmentId]
    ).then(r => r.rows[0] || null);
  }

  /** First active warehouse of a department (fallback when no main exists). */
  async findFirstActiveByDepartment(departmentId: number) {
    return pool.query(
      'SELECT id, code, name_ar, name_en FROM warehouses WHERE department_id = $1 AND is_active = true ORDER BY id LIMIT 1',
      [departmentId]
    ).then(r => r.rows[0] || null);
  }

  /**
   * The active main warehouse of the same department bucket (a NULL department
   * groups with other NULL-department warehouses), excluding an optional id so
   * the target warehouse itself is not treated as a duplicate on update.
   */
  async findActiveMain(departmentId: number | null, excludeId?: number) {
    const params: any[] = [departmentId ?? 0];
    let query =
      'SELECT id, code FROM warehouses WHERE COALESCE(department_id, 0) = $1 AND is_main = true AND is_active = true';
    if (excludeId != null) {
      params.push(excludeId);
      query += ` AND id <> $${params.length}`;
    }
    query += ' ORDER BY id LIMIT 1';
    const res = await pool.query(query, params);
    return res.rows[0] || null;
  }
}
export const warehousesRepository = new WarehousesRepository();
