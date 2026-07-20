import { pool } from '../../config/database';

export class SuppliersRepository {
  findAll(limit?: number, offset?: number) {
    let query = 'SELECT id, name_ar, name_en, phone, email, address, created_at, updated_at FROM suppliers WHERE is_active = true ORDER BY id';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    return (params.length ? pool.query(query, params) : pool.query(query)).then(r => r.rows);
  }

  countAll() {
    return pool.query('SELECT COUNT(*)::int AS total FROM suppliers WHERE is_active = true').then(r => r.rows[0].total);
  }

  findById(id: number) {
    return pool.query('SELECT id, name_ar, name_en, phone, email, address, created_at, updated_at FROM suppliers WHERE id = $1 AND is_active = true', [id])
      .then(r => r.rows[0] || null);
  }

  async create(data: { name_ar: string; name_en?: string; phone?: string; email?: string; address?: string }) {
    const res = await pool.query(
      `INSERT INTO suppliers (name_ar, name_en, phone, email, address) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.name_ar, data.name_en ?? null, data.phone ?? null, data.email ?? null, data.address ?? null]
    );
    return res.rows[0];
  }

  async update(id: number, data: { name_ar?: string; name_en?: string; phone?: string; email?: string; address?: string }) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map(k => (data as any)[k]);
    const res = await pool.query(
      `UPDATE suppliers SET ${setClauses.join(', ')} WHERE id = $1 AND is_active = true RETURNING *`,
      [id, ...values]
    );
    return res.rows[0] || null;
  }

  delete(id: number) {
    return pool.query('UPDATE suppliers SET is_active = false WHERE id = $1 AND is_active = true RETURNING *', [id])
      .then(r => r.rows[0] || null);
  }
}
export const suppliersRepository = new SuppliersRepository();
