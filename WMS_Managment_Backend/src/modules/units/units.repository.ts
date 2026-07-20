import { pool } from '../../config/database';

export class UnitsRepository {
  findAll(limit?: number, offset?: number) {
    let query = 'SELECT code, name_ar, name_en, created_at, updated_at FROM units WHERE is_active = true ORDER BY code';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    return (params.length ? pool.query(query, params) : pool.query(query)).then(r => r.rows);
  }

  countAll() {
    return pool.query('SELECT COUNT(*)::int AS total FROM units WHERE is_active = true').then(r => r.rows[0].total);
  }

  findByCode(code: string) {
    return pool.query('SELECT code, name_ar, name_en, created_at, updated_at FROM units WHERE code = $1 AND is_active = true', [code])
      .then(r => r.rows[0] || null);
  }

  create(data: { code: string; name_ar: string; name_en: string }) {
    return pool.query(
      `INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $3) RETURNING *`,
      [data.code, data.name_ar, data.name_en]
    ).then(r => r.rows[0]);
  }

  async update(code: string, data: { name_ar?: string; name_en?: string }) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findByCode(code);
    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map(k => (data as any)[k]);
    const res = await pool.query(
      `UPDATE units SET ${setClauses.join(', ')} WHERE code = $1 AND is_active = true RETURNING *`,
      [code, ...values]
    );
    return res.rows[0] || null;
  }

  delete(code: string) {
    return pool.query('UPDATE units SET is_active = false WHERE code = $1 AND is_active = true RETURNING *', [code])
      .then(r => r.rows[0] || null);
  }
}
export const unitsRepository = new UnitsRepository();
