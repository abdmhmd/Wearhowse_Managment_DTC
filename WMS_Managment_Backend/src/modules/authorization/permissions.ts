/**
 * Canonical permission catalog.
 *
 * These codes MUST match the `permissions.code` values seeded by
 * migration 017 (see migrations/017_rbac_permissions.sql). The catalog is the
 * single source of truth for route-level guards and frontend `can()` checks.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',

  CATEGORIES_VIEW: 'categories:view',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',

  UNITS_VIEW: 'units:view',
  UNITS_CREATE: 'units:create',
  UNITS_UPDATE: 'units:update',
  UNITS_DELETE: 'units:delete',

  SUPPLIERS_VIEW: 'suppliers:view',
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_UPDATE: 'suppliers:update',
  SUPPLIERS_DELETE: 'suppliers:delete',

  DEPARTMENTS_VIEW: 'departments:view',
  DEPARTMENTS_CREATE: 'departments:create',
  DEPARTMENTS_UPDATE: 'departments:update',
  DEPARTMENTS_DELETE: 'departments:delete',

  WAREHOUSES_VIEW: 'warehouses:view',
  WAREHOUSES_CREATE: 'warehouses:create',
  WAREHOUSES_UPDATE: 'warehouses:update',
  WAREHOUSES_DELETE: 'warehouses:delete',

  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',

  SUPERVISORS_VIEW: 'supervisors:view',
  SUPERVISORS_CREATE: 'supervisors:create',
  SUPERVISORS_UPDATE: 'supervisors:update',
  SUPERVISORS_DELETE: 'supervisors:delete',

  ITEMS_VIEW: 'items:view',
  ITEMS_CREATE: 'items:create',
  ITEMS_UPDATE: 'items:update',
  ITEMS_DELETE: 'items:delete',

  UNIT_CONVERSIONS_VIEW: 'unit-conversions:view',
  UNIT_CONVERSIONS_CREATE: 'unit-conversions:create',
  UNIT_CONVERSIONS_UPDATE: 'unit-conversions:update',
  UNIT_CONVERSIONS_DELETE: 'unit-conversions:delete',

  TRANSACTIONS_VIEW: 'transactions:view',
  TRANSACTIONS_CREATE: 'transactions:create',
  TRANSACTIONS_APPROVE: 'transactions:approve',

  STOCK_MOVEMENTS_VIEW: 'stock-movements:view',
  STOCK_MOVEMENTS_VIEW_ALL: 'stock-movements:view-all',

  REPORTS_VIEW: 'reports:view',

  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',

  REQUESTS_VIEW: 'requests:view',
  REQUESTS_VIEW_OWN: 'requests:view_own',
  REQUESTS_CREATE: 'requests:create',
  REQUESTS_APPROVE: 'requests:approve',
  REQUESTS_FORWARD: 'requests:forward',
  REQUESTS_REJECT: 'requests:reject',
  REQUESTS_ISSUE: 'requests:issue',
  REQUESTS_CANCEL: 'requests:cancel',

  ALERTS_VIEW: 'alerts:view',
  ALERTS_ACKNOWLEDGE: 'alerts:acknowledge',

  INVENTORY_SESSION_OPEN: 'inventory:session:open',
  INVENTORY_SESSION_VIEW: 'inventory:session:view',
  INVENTORY_COUNT_RECORD: 'inventory:count:record',
  INVENTORY_SESSION_CLOSE: 'inventory:session:close',

  BATCHES_VIEW: 'batches:view',

  PROJECTS_VIEW: 'projects:view',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_CLOSE: 'projects:close',
  PROJECTS_DELETE: 'projects:delete',
  /** Look up candidate supervisors for a project (scoped to the caller's department). */
  PROJECTS_SUPERVISORS: 'projects:supervisors',

  CUSTODIES_VIEW: 'custodies:view',
  CUSTODIES_RETURN: 'custodies:return',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All permission codes as a plain array (useful for seeding/tests). */
export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);
