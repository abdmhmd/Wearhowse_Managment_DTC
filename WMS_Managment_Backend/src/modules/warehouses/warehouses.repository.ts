import { pool } from '../../config/database';

export class WarehousesRepository {
  findAll(limit?: number, offset?: number) {
    let query = 'SELECT id, code, name_ar, name_en, location, created_at, updated_at FROM warehouses WHERE is_active = true ORDER BY code';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    return (params.length ? pool.query(query, params) : pool.query(query)).then(r => r.rows);
  }

  countAll() {
    return pool.query('SELECT COUNT(*)::int AS total FROM warehouses WHERE is_active = true').then(r => r.rows[0].total);
  }

  findById(id: number) {
    return pool.query('SELECT id, code, name_ar, name_en, location, created_at, updated_at FROM warehouses WHERE id = $1 AND is_active = true', [id])
      .then(r => r.rows[0] || null);
  }

  create(data: { code: string; name_ar: string; name_en?: string; location?: string }) {
    return pool.query(
      `INSERT INTO warehouses (code, name_ar, name_en, location) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.code, data.name_ar, data.name_en ?? null, data.location ?? null]
    ).then(r => r.rows[0]);
  }

  async update(id: number, data: { code?: string; name_ar?: string; name_en?: string; location?: string }) {
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
}
export const warehousesRepository = new WarehousesRepository();
