import { pool } from '../../config/database';
import { scopeForUser } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export class DepartmentsRepository {
  /**
   * Builds a scope fragment (without leading AND) restricting `departments` to
   * the rows the user may see. Mirrors the logic used by `findAll`/`countAll`:
   * GLOBAL = all, DEPARTMENT = own department, WAREHOUSE = departments owning
   * one of the user's assigned warehouses, NONE = nothing.
   */
  private scopeClause(user: AuthUserContext, startIndex: number): { sql: string; params: any[] } {
    const scope = scopeForUser(user);
    if (scope === 'GLOBAL') return { sql: 'TRUE', params: [] };
    if (scope === 'DEPARTMENT' && user.department_id != null) {
      return { sql: `id = $${startIndex}`, params: [user.department_id] };
    }
    if (scope === 'WAREHOUSE') {
      if (user.warehouse_ids.length === 0) return { sql: 'FALSE', params: [] };
      return {
        sql: `id IN (SELECT DISTINCT department_id FROM warehouses WHERE id = ANY($${startIndex}) AND department_id IS NOT NULL AND is_active = true)`,
        params: [user.warehouse_ids],
      };
    }
    return { sql: 'FALSE', params: [] };
  }

  findAll(limit?: number, offset?: number, user?: AuthUserContext) {
    let query = 'SELECT id, code, name_ar, name_en, created_at, updated_at FROM departments WHERE is_active = true';
    const params: any[] = [];
    let paramIndex = 1;

    if (user) {
      const scope = this.scopeClause(user, paramIndex);
      if (scope.sql !== 'TRUE') {
        query += ` AND ${scope.sql}`;
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
    let query = 'SELECT COUNT(*)::int AS total FROM departments WHERE is_active = true';
    const params: any[] = [];
    let paramIndex = 1;

    if (user) {
      const scope = this.scopeClause(user, paramIndex);
      if (scope.sql !== 'TRUE') {
        query += ` AND ${scope.sql}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
    }

    return pool.query(query, params).then(r => r.rows[0].total);
  }

  /**
   * Fetches a department by code restricted to the user's scope. A user
   * outside the scope gets `null` (treated as 404 by the controller), so a
   * department_manager / sub_warehouse_manager cannot read another department.
   */
  async findByCode(code: string, user?: AuthUserContext) {
    let query = 'SELECT id, code, name_ar, name_en, created_at, updated_at FROM departments WHERE code = $1 AND is_active = true';
    const params: any[] = [code];

    if (user) {
      const scope = this.scopeClause(user, 2);
      if (scope.sql !== 'TRUE') {
        query += ` AND ${scope.sql}`;
        params.push(...scope.params);
      }
    }

    const res = await pool.query(query, params);
    return res.rows[0] || null;
  }

  create(data: { code: string; name_ar: string; name_en?: string }) {
    return pool.query(
      `INSERT INTO departments (code, name_ar, name_en) VALUES ($1, $2, $3) RETURNING *`,
      [data.code, data.name_ar, data.name_en ?? null]
    ).then(r => r.rows[0]);
  }

  async update(code: string, data: { name_ar?: string; name_en?: string }) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findByCode(code);
    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map(k => (data as any)[k]);
    const res = await pool.query(
      `UPDATE departments SET ${setClauses.join(', ')} WHERE code = $1 AND is_active = true RETURNING *`,
      [code, ...values]
    );
    return res.rows[0] || null;
  }

  delete(code: string) {
    return pool.query('UPDATE departments SET is_active = false WHERE code = $1 AND is_active = true RETURNING *', [code])
      .then(r => r.rows[0] || null);
  }
}
export const departmentsRepository = new DepartmentsRepository();
