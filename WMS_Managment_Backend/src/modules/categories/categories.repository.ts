import { pool } from '../../config/database';

export class CategoriesRepository {
  findAll(limit?: number, offset?: number) {
    let query = 'SELECT code, name_ar, name_en, description, created_at, updated_at FROM categories WHERE is_active = true ORDER BY code';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    const res = params.length ? pool.query(query, params) : pool.query(query);
    return res.then(r => r.rows);
  }

  countAll() {
    return pool.query('SELECT COUNT(*)::int AS total FROM categories WHERE is_active = true')
      .then(r => r.rows[0].total);
  }

  findByCode(code: string) {
    return pool.query('SELECT code, name_ar, name_en, description, created_at, updated_at FROM categories WHERE code = $1 AND is_active = true', [code])
      .then(r => r.rows[0] || null);
  }

  create(category: { code: string; name_ar: string; name_en?: string; description?: string }) {
    return pool.query(
      `INSERT INTO categories (code, name_ar, name_en, description) VALUES ($1, $2, $3, $4) RETURNING *`,
      [category.code, category.name_ar, category.name_en ?? null, category.description ?? null]
    ).then(r => r.rows[0]);
  }

  async update(code: string, category: { name_ar?: string; name_en?: string; description?: string }) {
    const keys = Object.keys(category);
    if (keys.length === 0) return this.findByCode(code);

    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map(k => (category as any)[k]);

    const res = await pool.query(
      `UPDATE categories SET ${setClauses.join(', ')} WHERE code = $1 AND is_active = true RETURNING *`,
      [code, ...values]
    );
    return res.rows[0] || null;
  }

  delete(code: string) {
    return pool.query('UPDATE categories SET is_active = false WHERE code = $1 AND is_active = true RETURNING *', [code])
      .then(r => r.rows[0] || null);
  }
}
export const categoriesRepository = new CategoriesRepository();
