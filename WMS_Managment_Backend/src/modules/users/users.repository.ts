import { pool } from '../../config/database';

export class UsersRepository {
  async findAll(limit?: number, offset?: number): Promise<any[]> {
    let query = 'SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users WHERE is_active = true ORDER BY id';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    const res = await (params.length ? pool.query(query, params) : pool.query(query));
    return res.rows;
  }

  async countAll(): Promise<number> {
    const res = await pool.query('SELECT COUNT(*)::int AS total FROM users WHERE is_active = true');
    return res.rows[0].total;
  }

  async findByUsername(username: string): Promise<any | null> {
    const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0] || null;
  }

  async findById(id: number): Promise<any | null> {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async create(user: { username: string; password_hash: string; full_name: string; role: string }): Promise<any> {
    const res = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [user.username, user.password_hash, user.full_name, user.role]
    );
    return res.rows[0];
  }

  async update(id: number, data: Partial<any>): Promise<any | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id);
    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map(k => (data as any)[k]);
    const res = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return res.rows[0] || null;
  }

  delete(id: number) {
    return pool.query('UPDATE users SET is_active = false WHERE id = $1 AND is_active = true RETURNING *', [id])
      .then(r => r.rows[0] || null);
  }
}
export const usersRepository = new UsersRepository();
