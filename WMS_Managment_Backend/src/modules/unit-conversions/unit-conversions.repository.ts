import { pool } from '../../config/database';

export class UnitConversionsRepository {
  async findAll(limit?: number, offset?: number) {
    let query = 'SELECT id, item_id, from_unit_code, to_unit_code, factor FROM unit_conversions ORDER BY id';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    const res = params.length ? await pool.query(query, params) : await pool.query(query);
    return res.rows;
  }

  async countAll() {
    const res = await pool.query('SELECT COUNT(*)::int AS total FROM unit_conversions');
    return res.rows[0].total;
  }

  async findByItemId(item_id: number) {
    const res = await pool.query(
      'SELECT id, item_id, from_unit_code, to_unit_code, factor FROM unit_conversions WHERE item_id = $1 ORDER BY id',
      [item_id]
    );
    return res.rows;
  }

  async create(data: {
    item_id: number;
    from_unit_code: string;
    to_unit_code: string;
    factor: number;
  }) {
    const res = await pool.query(
      `INSERT INTO unit_conversions (item_id, from_unit_code, to_unit_code, factor)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.item_id, data.from_unit_code, data.to_unit_code, data.factor]
    );
    return res.rows[0];
  }

  async update(id: number, data: { from_unit_code?: string; to_unit_code?: string; factor?: number }) {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      const res = await pool.query('SELECT id, item_id, from_unit_code, to_unit_code, factor FROM unit_conversions WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      return res.rows[0];
    }

    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map((k) => (data as any)[k]);

    const res = await pool.query(
      `UPDATE unit_conversions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async delete(id: number) {
    const res = await pool.query('DELETE FROM unit_conversions WHERE id = $1 RETURNING *', [id]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }
}
export const unitConversionsRepository = new UnitConversionsRepository();
