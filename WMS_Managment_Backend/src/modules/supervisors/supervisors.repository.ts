import { pool } from '../../config/database';

/** A supervisor is a user with role `supervisor` (public shape). */
export interface SupervisorRow {
  id: number;
  username: string;
  full_name: string;
  role: 'supervisor';
  department_id: number | null;
  department_name_ar: string | null;
  department_name_en: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SupervisorListFilters {
  departmentId?: number | null;
  search?: string;
}

const SUPERVISOR_SELECT = `
  SELECT u.id, u.username, u.full_name, u.role, u.department_id,
         d.name_ar AS department_name_ar,
         d.name_en AS department_name_en,
         u.is_active, u.created_at, u.updated_at
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
   WHERE u.role = 'supervisor'`;

function buildWhere(filters: SupervisorListFilters): { clause: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  if (filters.departmentId !== undefined && filters.departmentId !== null) {
    params.push(filters.departmentId);
    clauses.push(`u.department_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`(u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  return { clause: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

export class SupervisorsRepository {
  async findAll(
    filters: SupervisorListFilters,
    limit: number,
    offset: number
  ): Promise<SupervisorRow[]> {
    const { clause, params } = buildWhere(filters);
    params.push(limit, offset);
    const res = await pool.query(
      `${SUPERVISOR_SELECT}${clause} ORDER BY u.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.rows;
  }

  async countAll(filters: SupervisorListFilters): Promise<number> {
    const { clause, params } = buildWhere(filters);
    const res = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users u WHERE u.role = 'supervisor'${clause}`,
      params
    );
    return res.rows[0].total;
  }

  async findById(id: number): Promise<SupervisorRow | null> {
    const res = await pool.query(`${SUPERVISOR_SELECT} AND u.id = $1`, [id]);
    return res.rows[0] || null;
  }

  async findByUsername(username: string): Promise<{ id: number } | null> {
    const res = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    return res.rows[0] || null;
  }

  async create(data: {
    username: string;
    password_hash: string;
    full_name: string;
    department_id: number;
    is_active: boolean;
  }): Promise<SupervisorRow> {
    const res = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
       VALUES ($1, $2, $3, 'supervisor', $4, $5)
       RETURNING id`,
      [data.username, data.password_hash, data.full_name, data.department_id, data.is_active]
    );
    const created = await this.findById(res.rows[0].id);
    if (!created) throw new Error('Supervisor insert returned no row');
    return created;
  }

  async update(
    id: number,
    data: {
      username?: string;
      password_hash?: string;
      full_name?: string;
      is_active?: boolean;
    }
  ): Promise<SupervisorRow | null> {
    const safeKeys = (['username', 'password_hash', 'full_name', 'is_active'] as const).filter(
      (k) => data[k] !== undefined
    );
    if (safeKeys.length === 0) return this.findById(id);

    const revokesSession = safeKeys.some((k) => k === 'password_hash' || k === 'is_active');
    const setClauses = safeKeys.map((key, i) => `"${key}" = $${i + 2}`);
    if (revokesSession) setClauses.push('token_version = token_version + 1');
    const values = safeKeys.map((k) => data[k] as string | boolean);

    const res = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING id`,
      [id, ...values]
    );
    if (!res.rows[0]) return null;
    return this.findById(id);
  }

  async delete(id: number): Promise<SupervisorRow | null> {
    const res = await pool.query(
      `UPDATE users SET is_active = false, token_version = token_version + 1
        WHERE id = $1 AND is_active = true RETURNING id`,
      [id]
    );
    if (!res.rows[0]) return null;
    return this.findById(id);
  }
}

export const supervisorsRepository = new SupervisorsRepository();
