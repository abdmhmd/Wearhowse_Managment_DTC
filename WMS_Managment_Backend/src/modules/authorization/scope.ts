import type { AuthUserContext } from './authorization.service';

export type DataScope = 'GLOBAL' | 'DEPARTMENT' | 'WAREHOUSE' | 'NONE';

/**
 * Determines the data scope a user has over a resource owned by a department
 * and/or a warehouse.
 *
 * - system_admin sees everything (GLOBAL).
 * - department_manager sees rows of their own department (DEPARTMENT).
 * - warehouse_manager sees rows of their assigned warehouses (WAREHOUSE).
 * - Any other (legacy, deactivated) role resolves to NONE.
 */
export function scopeForUser(user: AuthUserContext): DataScope {
  if (user.role === 'system_admin') return 'GLOBAL';
  if (user.role === 'department_manager') return user.department_id ? 'DEPARTMENT' : 'NONE';
  if (user.role === 'warehouse_manager') {
    return user.warehouse_ids.length > 0 ? 'WAREHOUSE' : 'NONE';
  }
  return 'NONE';
}

/**
 * Builds a SQL WHERE fragment restricting a row to the current user's scope.
 *
 * Both `departmentCol` and `warehouseCol` may be `null` when the table has no
 * such column. When both are provided the fragment matches either a
 * department-owned OR a warehouse-owned row (a user may hold both scopes,
 * e.g. system_admin + department_manager).
 *
 * `startIndex` is the 1-based index of the first query parameter so the
 * generated placeholders never collide with placeholders already consumed by
 * the caller's other filters.
 */
export function scopeClause(
  user: AuthUserContext,
  opts: { departmentCol?: string; warehouseCol?: string },
  startIndex = 1
): { clause: string; params: any[] } {
  const { departmentCol, warehouseCol } = opts;
  const scope = scopeForUser(user);
  let n = startIndex;

  if (scope === 'GLOBAL') return { clause: 'TRUE', params: [] };

  if (scope === 'DEPARTMENT') {
    const parts: string[] = [];
    const params: any[] = [];
    if (departmentCol) {
      params.push(user.department_id);
      parts.push(`${departmentCol} = $${n++}`);
    }
    if (warehouseCol && user.warehouse_ids.length > 0) {
      params.push(user.warehouse_ids);
      parts.push(`${warehouseCol} = ANY($${n++})`);
    }
    if (parts.length === 0) return { clause: 'FALSE', params: [] };
    return { clause: parts.join(' OR '), params };
  }

  if (scope === 'WAREHOUSE') {
    if (!warehouseCol || user.warehouse_ids.length === 0) return { clause: 'FALSE', params: [] };
    return { clause: `${warehouseCol} = ANY($${n})`, params: [user.warehouse_ids] };
  }

  return { clause: 'FALSE', params: [] };
}

/**
 * Builds a SQL WHERE fragment restricting a row to the warehouses the current
 * user may access. Used for warehouse-owned tables (items, stock movements).
 * `warehouseCol` may be qualified, e.g. `'i.warehouse_id'`.
 *
 * - GLOBAL (system_admin): all warehouses.
 * - WAREHOUSE (warehouse_manager): the explicitly assigned warehouses.
 * - DEPARTMENT (department_manager): warehouses owned by the user's department
 *   (warehouses.department_id) plus any explicitly assigned warehouses.
 *
 * `startIndex` is the 1-based index of the first query parameter so the
 * generated placeholders never collide with placeholders already consumed by
 * the caller's other filters.
 */
export function warehouseAccessClause(
  user: AuthUserContext,
  warehouseCol: string,
  startIndex = 1
): { clause: string; params: any[] } {
  const scope = scopeForUser(user);
  if (scope === 'GLOBAL') return { clause: 'TRUE', params: [] };

  if (scope === 'WAREHOUSE') {
    if (user.warehouse_ids.length === 0) return { clause: 'FALSE', params: [] };
    return { clause: `${warehouseCol} = ANY($${startIndex})`, params: [user.warehouse_ids] };
  }

  if (scope === 'DEPARTMENT') {
    const parts: string[] = [];
    const params: any[] = [];
    if (user.department_id != null) {
      params.push(user.department_id);
      parts.push(
        `${warehouseCol} IN (SELECT w.id FROM warehouses w WHERE w.department_id = $${startIndex + params.length - 1} AND w.is_active = true)`
      );
    }
    if (user.warehouse_ids.length > 0) {
      params.push(user.warehouse_ids);
      parts.push(`${warehouseCol} = ANY($${startIndex + params.length - 1})`);
    }
    if (parts.length === 0) return { clause: 'FALSE', params: [] };
    return { clause: `(${parts.join(' OR ')})`, params };
  }

  return { clause: 'FALSE', params: [] };
}

/**
 * Returns the accessible department ids for the current user (GLOBAL = all,
 * DEPARTMENT = own department, otherwise none). Used for `= ANY($n)` filters.
 */
export function accessibleDepartmentIds(user: AuthUserContext): number[] | null {
  const scope = scopeForUser(user);
  if (scope === 'GLOBAL') return null;
  if (scope === 'DEPARTMENT' && user.department_id != null) return [user.department_id];
  return [];
}

/** Returns the accessible warehouse ids (GLOBAL = null meaning all). */
export function accessibleWarehouseIds(user: AuthUserContext): number[] | null {
  const scope = scopeForUser(user);
  if (scope === 'GLOBAL') return null;
  return user.warehouse_ids;
}
