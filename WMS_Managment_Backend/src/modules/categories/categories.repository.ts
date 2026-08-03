import { pool } from '../../config/database';

export interface CategoryRow {
  code: string;
  name_ar: string;
  name_en?: string;
  prefix?: string;
  description?: string;
  parent_code?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CategoryTreeNode extends CategoryRow {
  children: CategoryTreeNode[];
}

const CATEGORY_SELECT = 'code, name_ar, name_en, prefix, description, parent_code, created_at, updated_at';

export class CategoriesRepository {
  findAll(limit?: number, offset?: number) {
    let query = `SELECT ${CATEGORY_SELECT} FROM categories WHERE is_active = true ORDER BY COALESCE(parent_code, code), code`;
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
    return pool.query(`SELECT ${CATEGORY_SELECT} FROM categories WHERE code = $1 AND is_active = true`, [code])
      .then(r => r.rows[0] || null);
  }

  /** Returns all active categories as a nested tree structure */
  async findTree(): Promise<CategoryTreeNode[]> {
    const res = await pool.query(
      `SELECT ${CATEGORY_SELECT} FROM categories WHERE is_active = true ORDER BY COALESCE(parent_code, code), code`
    );
    const rows: CategoryRow[] = res.rows;
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    // Build map
    for (const row of rows) {
      map.set(row.code, { ...row, children: [] });
    }
    // Build tree
    for (const node of map.values()) {
      if (node.parent_code && map.has(node.parent_code)) {
        map.get(node.parent_code)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /** Returns all descendants of a category (flat list) */
  async findDescendants(code: string): Promise<CategoryRow[]> {
    const res = await pool.query(
      `WITH RECURSIVE tree AS (
         SELECT ${CATEGORY_SELECT} FROM categories WHERE code = $1 AND is_active = true
         UNION ALL
         SELECT c.${CATEGORY_SELECT.split(', ').map(f => 'c.' + f).join(', ')}
         FROM categories c
         JOIN tree t ON c.parent_code = t.code
         WHERE c.is_active = true
       )
       SELECT ${CATEGORY_SELECT} FROM tree`,
      [code]
    );
    return res.rows;
  }

  create(category: { code: string; name_ar: string; name_en?: string; prefix?: string; description?: string; parent_code?: string | null }) {
    return pool.query(
      `INSERT INTO categories (code, name_ar, name_en, prefix, description, parent_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        category.code,
        category.name_ar,
        category.name_en ?? null,
        category.prefix ?? null,
        category.description ?? null,
        category.parent_code ?? null,
      ]
    ).then(r => r.rows[0]);
  }

  async update(code: string, category: { name_ar?: string; name_en?: string; prefix?: string; description?: string; parent_code?: string | null }) {
    // Allowlist: only these columns may be updated
    const ALLOWED_FIELDS: (keyof typeof category)[] = ['name_ar', 'name_en', 'prefix', 'description', 'parent_code'];
    const safeKeys = (Object.keys(category) as (keyof typeof category)[]).filter(k => ALLOWED_FIELDS.includes(k));

    if (safeKeys.length === 0) return this.findByCode(code);

    // Prevent circular reference: a category cannot be its own parent or ancestor
    if (category.parent_code === code) {
      throw new Error('A category cannot be its own parent');
    }

    const setClauses = safeKeys.map((key, i) => `${key} = $${i + 2}`);
    const values = safeKeys.map(k => (category as any)[k]);

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
