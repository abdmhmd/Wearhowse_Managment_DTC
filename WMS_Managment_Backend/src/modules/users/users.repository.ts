import { pool } from '../../config/database';

// All active roles in the system (storekeeper/accountant/viewer were
// deactivated in migration 019; legacy users keep their role value for data
// continuity but cannot log in until reassigned).
export type UserRole =
  | 'system_admin'
  | 'warehouse_manager'
  | 'department_manager'
  | 'supervisor';

/** Roles that may log in. Legacy roles (storekeeper/accountant/viewer) were
 *  deactivated in migration 019; users holding them must be reassigned. */
export const ACTIVE_ROLES: readonly string[] = [
  'system_admin',
  'warehouse_manager',
  'department_manager',
  'supervisor',
];

// Private row type — includes password_hash for auth operations
export interface UserRowPrivate {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  department_id?: number | null;  // For department_manager role scoping
  is_active: boolean;
  token_version: number;
  created_at: Date;
  updated_at: Date;
}

// Public row type — excludes password_hash for API responses
export type UserRowPublic = Omit<UserRowPrivate, 'password_hash'>;

export type CreateUserData = Pick<UserRowPrivate, 'username' | 'password_hash' | 'full_name' | 'role'> & { department_id?: number | null };
export type UpdateUserData = Partial<Pick<UserRowPrivate, 'username' | 'password_hash' | 'full_name' | 'role' | 'is_active'> & { department_id?: number | null }>;

const ALLOWED_USER_UPDATE_FIELDS: (keyof UpdateUserData)[] = [
  'username',
  'password_hash',
  'full_name',
  'role',
  'is_active',
  'department_id',
];

export class UsersRepository {
  async findAll(limit?: number, offset?: number): Promise<UserRowPublic[]> {
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

  async findByUsername(username: string): Promise<UserRowPrivate | null> {
    const res = await pool.query('SELECT id, username, password_hash, full_name, role, department_id, is_active, token_version, created_at, updated_at FROM users WHERE username = $1', [username]);
    return res.rows[0] || null;
  }

  async findById(id: number): Promise<UserRowPublic | null> {
    const res = await pool.query('SELECT id, username, full_name, role, department_id, is_active, token_version, created_at, updated_at FROM users WHERE id = $1 AND is_active = true', [id]);
    return res.rows[0] || null;
  }

  async create(user: CreateUserData): Promise<UserRowPublic> {
    const res = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role, department_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, role, department_id, is_active, created_at, updated_at',
      [user.username, user.password_hash, user.full_name, user.role, user.department_id ?? null]
    );
    return res.rows[0];
  }

  async update(id: number, data: UpdateUserData): Promise<UserRowPublic | null> {
    const safeKeys = Object.keys(data).filter((key) =>
      ALLOWED_USER_UPDATE_FIELDS.includes(key as keyof UpdateUserData)
    ) as (keyof UpdateUserData)[];

    if (safeKeys.length === 0) return this.findById(id);

    const setClauses = safeKeys.map((key, i) => `"${key}" = $${i + 2}`);
    const values = safeKeys.map((k) => data[k]);

    const res = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING id, username, full_name, role, department_id, is_active, created_at, updated_at`,
      [id, ...values]
    );
    return res.rows[0] || null;
  }

  async delete(id: number): Promise<UserRowPublic | null> {
    const res = await pool.query(
      'UPDATE users SET is_active = false WHERE id = $1 AND is_active = true RETURNING id, username, full_name, role, department_id, is_active, created_at, updated_at',
      [id]
    );
    return res.rows[0] || null;
  }

  /** Find all users belonging to a specific department (for department_manager scoping) */
  async findByDepartment(department_id: number): Promise<UserRowPublic[]> {
    const res = await pool.query(
      'SELECT id, username, full_name, role, department_id, is_active, created_at, updated_at FROM users WHERE department_id = $1 AND is_active = true',
      [department_id]
    );
    return res.rows;
  }

  /** Candidate project supervisors (role = 'supervisor'), for the project
   *  create/edit form. Pass `departmentId` to scope the lookup to a single
   *  department. */
  async findSupervisors(departmentId?: number): Promise<UserRowPublic[]> {
    const res = await pool.query(
      `SELECT id, username, full_name, role, department_id, is_active, created_at, updated_at
         FROM users
        WHERE is_active = true AND role = 'supervisor'
        ${departmentId !== undefined ? 'AND department_id = $1' : ''}
        ORDER BY full_name`,
      departmentId !== undefined ? [departmentId] : []
    );
    return res.rows;
  }

  async getWarehouseAssignments(userId: number): Promise<number[]> {
    const res = await pool.query(
      'SELECT warehouse_id FROM user_warehouses WHERE user_id = $1 ORDER BY warehouse_id',
      [userId]
    );
    return res.rows.map((r) => r.warehouse_id as number);
  }
}

export const usersRepository = new UsersRepository();

