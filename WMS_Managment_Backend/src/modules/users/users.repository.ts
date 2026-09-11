import { pool } from '../../config/database';
import { ConflictError } from '../../utils/AppError';

// The complete, canonical role set. Legacy roles (storekeeper/accountant/
// viewer) were removed entirely by migration 038 (users were reassigned, the
// user_role enum now contains only these four values).
export type UserRole =
  | 'admin'
  | 'sub_warehouse_manager'
  | 'department_manager'
  | 'supervisor';

/** Roles that may log in. Exactly the four enum values — kept as a defensive
 *  check in case a future migration temporarily widens the enum. */
export const ACTIVE_ROLES: readonly string[] = [
  'admin',
  'sub_warehouse_manager',
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
    let query = `SELECT u.id, u.username, u.full_name, u.role, u.department_id,
                        u.is_active, u.created_at, u.updated_at,
                        d.name_ar AS department_name_ar,
                        d.name_en AS department_name_en
                   FROM users u
                   LEFT JOIN departments d ON d.id = u.department_id
                  WHERE u.is_active = true
                  ORDER BY u.id`;
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

  /**
   * Physically deletes the user row. Referential integrity is preserved by the
   * existing schema constraints:
   *
   *   * ON DELETE CASCADE  -> refresh_tokens, user_warehouses
   *   * ON DELETE SET NULL -> audit_logs (audit trail is preserved, actor id
   *                           is nulled), transactions.approved_by, and the
   *                           other optional actor references
   *   * RESTRICT / NO ACTION -> transactions.created_by, stock_movements.user_id,
   *                           material_requests.requested_by,
   *                           projects.created_by / supervisor_id,
   *                           custodies.assigned_to
   *
   * When the user is referenced by one of those business tables Postgres
   * rejects the DELETE (error 23503); we surface it as a 409 Conflict so the
   * caller can deactivate the user instead of deleting.
   */
  async delete(id: number): Promise<UserRowPublic | null> {
    try {
      const res = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, username, full_name, role, department_id, is_active, created_at, updated_at',
        [id]
      );
      return res.rows[0] || null;
    } catch (error: any) {
      if (error?.code === '23503') {
        throw new ConflictError(
          'Cannot delete this user: they are referenced by existing business records (requests, projects, custodies, transactions or stock movements). Deactivate the user instead.',
          'USER_HAS_REFERENCES'
        );
      }
      throw error;
    }
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
      'SELECT warehouse_id FROM user_warehouses WHERE user_id = $1',
      [userId]
    );
    return res.rows.map((r) => r.warehouse_id);
  }

  /** warehouse assignment map for a batch of user ids (list endpoint). */
  async getWarehouseAssignmentsMap(userIds: number[]): Promise<Map<number, number[]>> {
    if (userIds.length === 0) return new Map();
    const res = await pool.query(
      'SELECT user_id, warehouse_id FROM user_warehouses WHERE user_id = ANY($1) ORDER BY warehouse_id',
      [userIds]
    );
    const map = new Map<number, number[]>();
    for (const row of res.rows) {
      const arr = map.get(row.user_id) || [];
      arr.push(row.warehouse_id);
      map.set(row.user_id, arr);
    }
    return map;
  }
}

export const usersRepository = new UsersRepository();

