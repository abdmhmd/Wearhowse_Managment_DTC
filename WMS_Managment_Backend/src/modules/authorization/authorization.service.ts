import { pool } from '../../config/database';
import type { UserRole } from '../users/users.repository';

export interface AuthWarehouse {
  id: number;
  code: string;
  name_ar: string;
  name_en: string | null;
}

/**
 * Full authorization context attached to every authenticated request.
 * Loaded fresh from the database on each request — the JWT carries identity
 * only and is never treated as authority.
 */
export interface AuthUserContext {
  id: number;
  userId: number;
  username: string;
  full_name: string;
  role: UserRole;
  department_id: number | null;
  /** Display names of the user's department (LEFT JOIN), null when unassigned. */
  department_name_ar: string | null;
  department_name_en: string | null;
  is_active: boolean;
  token_version: number;
  permissions: string[];
  /** Warehouses the user is explicitly assigned to (empty = no warehouse scope). */
  warehouses: AuthWarehouse[];
  /** Cached warehouse ids (convenience for scope filters). */
  warehouse_ids: number[];
}

export const getEffectivePermissions = async (role: string): Promise<string[]> => {
  const res = await pool.query(
    `SELECT p.code
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
      WHERE r.code = $1 AND r.is_active = true AND p.code IS NOT NULL
      ORDER BY p.code`,
    [role]
  );
  return res.rows.map((row) => row.code as string);
};

export const getAssignedWarehouses = async (userId: number): Promise<AuthWarehouse[]> => {
  const res = await pool.query(
    `SELECT w.id, w.code, w.name_ar, w.name_en
       FROM warehouses w
       JOIN user_warehouses uw ON uw.warehouse_id = w.id
      WHERE uw.user_id = $1
      ORDER BY w.id`,
    [userId]
  );
  return res.rows.map((row) => ({
    id: row.id as number,
    code: row.code as string,
    name_ar: row.name_ar as string,
    name_en: row.name_en as (string | null),
  }));
};

/**
 * Loads the complete authorization context for a user id, or null when the
 * user does not exist. Note: does NOT filter by is_active here — the caller
 * (authenticate/refresh) decides how to treat inactive users.
 */
export const loadAuthContext = async (userId: number): Promise<AuthUserContext | null> => {
  const user = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.department_id, u.is_active, u.token_version,
            d.name_ar AS department_name_ar, d.name_en AS department_name_en
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = $1`,
    [userId]
  );
  const row = user.rows[0];
  if (!row) return null;

  const [permissions, warehouses] = await Promise.all([
    getEffectivePermissions(row.role as string),
    getAssignedWarehouses(row.id as number),
  ]);

  return {
    id: row.id,
    userId: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    department_id: row.department_id,
    department_name_ar: row.department_name_ar as (string | null),
    department_name_en: row.department_name_en as (string | null),
    is_active: row.is_active,
    token_version: row.token_version,
    permissions,
    warehouses,
    warehouse_ids: warehouses.map((w) => w.id),
  };
};
