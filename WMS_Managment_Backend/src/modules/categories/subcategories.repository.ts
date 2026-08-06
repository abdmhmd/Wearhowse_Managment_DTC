import { pool } from '../../config/database';

export interface SubcategoryRow {
  id: number;
  category_code: string;
  code: string;
  name_ar: string;
  name_en?: string;
  description?: string;
  is_active?: boolean;
  created_at: Date;
  updated_at: Date;
}

const SUBCATEGORY_SELECT =
  'id, category_code, code, name_ar, name_en, description, is_active, created_at, updated_at';

export class SubcategoriesRepository {
  findByCategory(categoryCode: string, includeInactive = false) {
    const where = includeInactive ? 'WHERE sc.category_code = $1' : 'WHERE sc.category_code = $1 AND sc.is_active = true';
    return pool
      .query(
        `SELECT ${SUBCATEGORY_SELECT} FROM subcategories sc ${where} ORDER BY sc.code`,
        [categoryCode]
      )
      .then(r => r.rows);
  }

  findByCode(categoryCode: string, code: string) {
    return pool
      .query(
        `SELECT ${SUBCATEGORY_SELECT} FROM subcategories WHERE category_code = $1 AND code = $2 AND is_active = true`,
        [categoryCode, code]
      )
      .then(r => r.rows[0] || null);
  }

  findById(id: number) {
    return pool
      .query(`SELECT ${SUBCATEGORY_SELECT} FROM subcategories WHERE id = $1`, [id])
      .then(r => r.rows[0] || null);
  }

  create(data: { category_code: string; code: string; name_ar: string; name_en?: string; description?: string }) {
    return pool
      .query(
        `INSERT INTO subcategories (category_code, code, name_ar, name_en, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [data.category_code, data.code, data.name_ar, data.name_en ?? null, data.description ?? null]
      )
      .then(r => r.rows[0]);
  }

  async update(
    id: number,
    data: { name_ar?: string; name_en?: string; description?: string; is_active?: boolean }
  ) {
    const ALLOWED_FIELDS: (keyof typeof data)[] = ['name_ar', 'name_en', 'description', 'is_active'];
    const safeKeys = (Object.keys(data) as (keyof typeof data)[]).filter(k => ALLOWED_FIELDS.includes(k));
    if (safeKeys.length === 0) return this.findById(id);

    const setClauses = safeKeys.map((key, i) => `${key} = $${i + 2}`);
    const values = safeKeys.map(k => (data as any)[k]);

    const res = await pool.query(
      `UPDATE subcategories SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return res.rows[0] || null;
  }

  delete(id: number) {
    return pool
      .query('UPDATE subcategories SET is_active = false WHERE id = $1 AND is_active = true RETURNING *', [id])
      .then(r => r.rows[0] || null);
  }
}
export const subcategoriesRepository = new SubcategoriesRepository();
