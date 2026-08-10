-- ============================================================================
-- 017_rbac_permissions.sql  (UP)
-- Centralized, database-backed authorization:
--   * roles table (mirrors the existing `users.role` enum values)
--   * permissions catalog (resource:action)
--   * role_permissions mapping
--   * user_warehouses (explicit warehouse assignment for warehouse scoping)
--   * users.token_version (session revocation on role/status/password changes)
--   * audit_logs (write-path audit trail)
-- Seeds the full permission catalog and role matrix, and backfills
-- user_warehouses for existing warehouse_manager / storekeeper accounts
-- (they keep full visibility unless an administrator revokes assignments).
--
-- Dependencies: 001_initial_schema.sql + 002..016
-- Run inside a single transaction; rolled back atomically on any failure.
-- DOWN: 017_rbac_permissions.down.sql
-- ============================================================================
BEGIN;

-- 1. Roles -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL UNIQUE,
    name_ar     VARCHAR(255) NOT NULL,
    name_en     VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_roles_updated_at') THEN
    CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 2. Permissions catalog -----------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    resource    TEXT NOT NULL,
    action      TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_permissions_resource_action UNIQUE (resource, action)
);

-- 3. Role <-> permission mapping ---------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);

-- 4. Explicit warehouse assignment (data scoping for warehouse roles) --------
CREATE TABLE IF NOT EXISTS user_warehouses (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_user_warehouses_warehouse ON user_warehouses(warehouse_id);

-- 5. Session version for instant token revocation ----------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- 6. Audit log ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(50)  NOT NULL,
    resource    VARCHAR(50)  NOT NULL,
    resource_id VARCHAR(100),
    details     JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 7. Seed permissions --------------------------------------------------------
INSERT INTO permissions (code, resource, action, description) VALUES
  ('dashboard:view',                 'dashboard',        'view',   'View dashboard'),
  ('categories:view',                'categories',       'view',   'View categories'),
  ('categories:create',              'categories',       'create', 'Create categories'),
  ('categories:update',              'categories',       'update', 'Update categories'),
  ('categories:delete',              'categories',       'delete', 'Delete categories'),
  ('units:view',                     'units',            'view',   'View units'),
  ('units:create',                   'units',            'create', 'Create units'),
  ('units:update',                   'units',            'update', 'Update units'),
  ('units:delete',                   'units',            'delete', 'Delete units'),
  ('suppliers:view',                 'suppliers',        'view',   'View suppliers'),
  ('suppliers:create',               'suppliers',        'create', 'Create suppliers'),
  ('suppliers:update',               'suppliers',        'update', 'Update suppliers'),
  ('suppliers:delete',               'suppliers',        'delete', 'Delete suppliers'),
  ('departments:view',               'departments',      'view',   'View departments'),
  ('departments:create',             'departments',      'create', 'Create departments'),
  ('departments:update',             'departments',      'update', 'Update departments'),
  ('departments:delete',             'departments',      'delete', 'Delete departments'),
  ('warehouses:view',                'warehouses',       'view',   'View warehouses'),
  ('warehouses:create',              'warehouses',       'create', 'Create warehouses'),
  ('warehouses:update',              'warehouses',       'update', 'Update warehouses'),
  ('warehouses:delete',              'warehouses',       'delete', 'Delete warehouses'),
  ('users:view',                     'users',            'view',   'View users'),
  ('users:create',                   'users',            'create', 'Create users'),
  ('users:update',                   'users',            'update', 'Update users'),
  ('users:delete',                   'users',            'delete', 'Delete users'),
  ('items:view',                     'items',            'view',   'View items'),
  ('items:create',                   'items',            'create', 'Create items'),
  ('items:update',                   'items',            'update', 'Update items'),
  ('items:delete',                   'items',            'delete', 'Delete items'),
  ('unit-conversions:view',          'unit-conversions', 'view',   'View unit conversions'),
  ('unit-conversions:create',        'unit-conversions', 'create', 'Create unit conversions'),
  ('unit-conversions:update',        'unit-conversions', 'update', 'Update unit conversions'),
  ('unit-conversions:delete',        'unit-conversions', 'delete', 'Delete unit conversions'),
  ('transactions:view',              'transactions',     'view',   'View transactions'),
  ('transactions:create',            'transactions',     'create', 'Create transactions'),
  ('transactions:approve',           'transactions',     'approve','Approve transactions'),
  ('stock-movements:view',           'stock-movements',  'view',   'View stock movements by item/transaction'),
  ('stock-movements:view-all',       'stock-movements',  'view-all','View full stock movement history'),
  ('reports:view',                   'reports',          'view',   'View reports'),
  ('settings:view',                  'settings',         'view',   'View settings'),
  ('settings:update',                'settings',         'update', 'Update settings'),
  ('requests:view',                  'requests',         'view',   'View material requests'),
  ('requests:create',                'requests',         'create', 'Create material requests'),
  ('requests:approve',               'requests',         'approve','Approve material requests'),
  ('requests:reject',                'requests',         'reject', 'Reject material requests'),
  ('requests:issue',                 'requests',         'issue',  'Issue material requests'),
  ('requests:cancel',                'requests',         'cancel', 'Cancel material requests'),
  ('alerts:view',                    'alerts',           'view',   'View alerts'),
  ('alerts:acknowledge',             'alerts',           'acknowledge','Acknowledge alerts'),
  ('inventory:session:open',         'inventory',        'session:open',   'Open inventory sessions'),
  ('inventory:session:view',         'inventory',        'session:view',   'View inventory sessions'),
  ('inventory:count:record',         'inventory',        'count:record',   'Record inventory counts'),
  ('inventory:session:close',        'inventory',        'session:close',  'Close inventory sessions'),
  ('batches:view',                   'batches',          'view',   'View batches'),
  ('projects:view',                  'projects',         'view',   'View projects'),
  ('projects:create',                'projects',         'create', 'Create projects'),
  ('projects:update',                'projects',         'update', 'Update projects'),
  ('projects:close',                 'projects',         'close',  'Close projects'),
  ('projects:delete',                'projects',         'delete', 'Delete projects'),
  ('custodies:view',                 'custodies',        'view',   'View custodies'),
  ('custodies:return',               'custodies',        'return', 'Return custodies')
ON CONFLICT (code) DO NOTHING;

-- 8. Seed roles --------------------------------------------------------------
INSERT INTO roles (code, name_ar, name_en, description) VALUES
  ('system_admin',       'مدير النظام',         'System Admin',        'Full access to every module including user management and settings'),
  ('warehouse_manager',  'مدير المستودع',       'Warehouse Manager',   'Manages warehouses, items, transactions and requests (no user management / hard deletes)'),
  ('storekeeper',        'أمين المستودع',       'Storekeeper',         'Day-to-day warehouse operations: items, transactions, requests, counting'),
  ('accountant',         'محاسب',              'Accountant',          'Financial and reporting read access'),
  ('department_manager', 'مدير قسم',            'Department Manager',  'Creates requests and projects; manages their own department data'),
  ('viewer',             'مستعرض',             'Viewer',              'Read-only access to shared data')
ON CONFLICT (code) DO NOTHING;

-- 9. Role matrix (permission assignments) ------------------------------------
WITH matrix(code, perm) AS (VALUES
  -- system_admin: every permission
  ('system_admin', 'dashboard:view'),
  ('system_admin', 'categories:view'), ('system_admin', 'categories:create'), ('system_admin', 'categories:update'), ('system_admin', 'categories:delete'),
  ('system_admin', 'units:view'), ('system_admin', 'units:create'), ('system_admin', 'units:update'), ('system_admin', 'units:delete'),
  ('system_admin', 'suppliers:view'), ('system_admin', 'suppliers:create'), ('system_admin', 'suppliers:update'), ('system_admin', 'suppliers:delete'),
  ('system_admin', 'departments:view'), ('system_admin', 'departments:create'), ('system_admin', 'departments:update'), ('system_admin', 'departments:delete'),
  ('system_admin', 'warehouses:view'), ('system_admin', 'warehouses:create'), ('system_admin', 'warehouses:update'), ('system_admin', 'warehouses:delete'),
  ('system_admin', 'users:view'), ('system_admin', 'users:create'), ('system_admin', 'users:update'), ('system_admin', 'users:delete'),
  ('system_admin', 'items:view'), ('system_admin', 'items:create'), ('system_admin', 'items:update'), ('system_admin', 'items:delete'),
  ('system_admin', 'unit-conversions:view'), ('system_admin', 'unit-conversions:create'), ('system_admin', 'unit-conversions:update'), ('system_admin', 'unit-conversions:delete'),
  ('system_admin', 'transactions:view'), ('system_admin', 'transactions:create'), ('system_admin', 'transactions:approve'),
  ('system_admin', 'stock-movements:view'), ('system_admin', 'stock-movements:view-all'),
  ('system_admin', 'reports:view'),
  ('system_admin', 'settings:view'), ('system_admin', 'settings:update'),
  ('system_admin', 'requests:view'), ('system_admin', 'requests:create'), ('system_admin', 'requests:approve'), ('system_admin', 'requests:reject'), ('system_admin', 'requests:issue'), ('system_admin', 'requests:cancel'),
  ('system_admin', 'alerts:view'), ('system_admin', 'alerts:acknowledge'),
  ('system_admin', 'inventory:session:open'), ('system_admin', 'inventory:session:view'), ('system_admin', 'inventory:count:record'), ('system_admin', 'inventory:session:close'),
  ('system_admin', 'batches:view'),
  ('system_admin', 'projects:view'), ('system_admin', 'projects:create'), ('system_admin', 'projects:update'), ('system_admin', 'projects:close'), ('system_admin', 'projects:delete'),
  ('system_admin', 'custodies:view'), ('system_admin', 'custodies:return'),

  -- warehouse_manager
  ('warehouse_manager', 'dashboard:view'),
  ('warehouse_manager', 'categories:view'), ('warehouse_manager', 'categories:create'), ('warehouse_manager', 'categories:update'),
  ('warehouse_manager', 'units:view'), ('warehouse_manager', 'units:create'), ('warehouse_manager', 'units:update'),
  ('warehouse_manager', 'suppliers:view'), ('warehouse_manager', 'suppliers:create'), ('warehouse_manager', 'suppliers:update'),
  ('warehouse_manager', 'departments:view'), ('warehouse_manager', 'departments:create'), ('warehouse_manager', 'departments:update'),
  ('warehouse_manager', 'warehouses:view'), ('warehouse_manager', 'warehouses:create'), ('warehouse_manager', 'warehouses:update'),
  ('warehouse_manager', 'users:view'),
  ('warehouse_manager', 'items:view'), ('warehouse_manager', 'items:create'), ('warehouse_manager', 'items:update'),
  ('warehouse_manager', 'unit-conversions:view'), ('warehouse_manager', 'unit-conversions:create'), ('warehouse_manager', 'unit-conversions:update'),
  ('warehouse_manager', 'transactions:view'), ('warehouse_manager', 'transactions:create'), ('warehouse_manager', 'transactions:approve'),
  ('warehouse_manager', 'stock-movements:view'), ('warehouse_manager', 'stock-movements:view-all'),
  ('warehouse_manager', 'reports:view'),
  ('warehouse_manager', 'settings:view'),
  ('warehouse_manager', 'requests:view'), ('warehouse_manager', 'requests:create'), ('warehouse_manager', 'requests:approve'), ('warehouse_manager', 'requests:reject'), ('warehouse_manager', 'requests:issue'), ('warehouse_manager', 'requests:cancel'),
  ('warehouse_manager', 'alerts:view'), ('warehouse_manager', 'alerts:acknowledge'),
  ('warehouse_manager', 'inventory:session:open'), ('warehouse_manager', 'inventory:session:view'), ('warehouse_manager', 'inventory:count:record'), ('warehouse_manager', 'inventory:session:close'),
  ('warehouse_manager', 'batches:view'),
  ('warehouse_manager', 'projects:view'), ('warehouse_manager', 'projects:create'), ('warehouse_manager', 'projects:update'), ('warehouse_manager', 'projects:close'),
  ('warehouse_manager', 'custodies:view'), ('warehouse_manager', 'custodies:return'),

  -- storekeeper
  ('storekeeper', 'dashboard:view'),
  ('storekeeper', 'categories:view'),
  ('storekeeper', 'units:view'),
  ('storekeeper', 'suppliers:view'),
  ('storekeeper', 'departments:view'),
  ('storekeeper', 'warehouses:view'),
  ('storekeeper', 'users:view'),
  ('storekeeper', 'items:view'), ('storekeeper', 'items:create'),
  ('storekeeper', 'unit-conversions:view'),
  ('storekeeper', 'transactions:view'), ('storekeeper', 'transactions:create'),
  ('storekeeper', 'stock-movements:view'),
  ('storekeeper', 'settings:view'),
  ('storekeeper', 'requests:view'), ('storekeeper', 'requests:approve'), ('storekeeper', 'requests:reject'), ('storekeeper', 'requests:issue'), ('storekeeper', 'requests:cancel'),
  ('storekeeper', 'alerts:view'), ('storekeeper', 'alerts:acknowledge'),
  ('storekeeper', 'inventory:session:view'), ('storekeeper', 'inventory:count:record'),
  ('storekeeper', 'batches:view'),
  ('storekeeper', 'projects:view'), ('storekeeper', 'projects:create'), ('storekeeper', 'projects:update'), ('storekeeper', 'projects:close'),
  ('storekeeper', 'custodies:view'), ('storekeeper', 'custodies:return'),

  -- accountant
  ('accountant', 'dashboard:view'),
  ('accountant', 'categories:view'),
  ('accountant', 'units:view'),
  ('accountant', 'suppliers:view'),
  ('accountant', 'departments:view'),
  ('accountant', 'warehouses:view'),
  ('accountant', 'users:view'),
  ('accountant', 'items:view'),
  ('accountant', 'unit-conversions:view'),
  ('accountant', 'transactions:view'),
  ('accountant', 'stock-movements:view'), ('accountant', 'stock-movements:view-all'),
  ('accountant', 'reports:view'),
  ('accountant', 'settings:view'),
  ('accountant', 'requests:view'),
  ('accountant', 'alerts:view'),
  ('accountant', 'inventory:session:view'),
  ('accountant', 'batches:view'),
  ('accountant', 'projects:view'),
  ('accountant', 'custodies:view'),

  -- department_manager
  ('department_manager', 'dashboard:view'),
  ('department_manager', 'categories:view'),
  ('department_manager', 'units:view'),
  ('department_manager', 'suppliers:view'),
  ('department_manager', 'departments:view'),
  ('department_manager', 'warehouses:view'),
  ('department_manager', 'users:view'),
  ('department_manager', 'items:view'),
  ('department_manager', 'unit-conversions:view'),
  ('department_manager', 'transactions:view'),
  ('department_manager', 'settings:view'),
  ('department_manager', 'requests:view'), ('department_manager', 'requests:create'), ('department_manager', 'requests:cancel'),
  ('department_manager', 'alerts:view'), ('department_manager', 'alerts:acknowledge'),
  ('department_manager', 'batches:view'),
  ('department_manager', 'projects:view'), ('department_manager', 'projects:create'), ('department_manager', 'projects:update'), ('department_manager', 'projects:close'),
  ('department_manager', 'custodies:view'), ('department_manager', 'custodies:return'),

  -- viewer
  ('viewer', 'dashboard:view'),
  ('viewer', 'categories:view'),
  ('viewer', 'units:view'),
  ('viewer', 'suppliers:view'),
  ('viewer', 'departments:view'),
  ('viewer', 'warehouses:view'),
  ('viewer', 'users:view'),
  ('viewer', 'items:view'),
  ('viewer', 'unit-conversions:view'),
  ('viewer', 'transactions:view'),
  ('viewer', 'settings:view'),
  ('viewer', 'requests:view'),
  ('viewer', 'alerts:view'),
  ('viewer', 'batches:view'),
  ('viewer', 'projects:view'),
  ('viewer', 'custodies:view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.code = m.code
JOIN permissions p ON p.code = m.perm
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 10. Backfill user_warehouses for existing warehouse roles ------------------
-- Existing warehouse_manager / storekeeper accounts keep visibility into all
-- warehouses; administrators can revoke individual assignments later.
INSERT INTO user_warehouses (user_id, warehouse_id)
SELECT u.id, w.id
FROM users u
CROSS JOIN warehouses w
WHERE u.role IN ('warehouse_manager', 'storekeeper')
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_warehouses uw
    WHERE uw.user_id = u.id AND uw.warehouse_id = w.id
  );

COMMIT;
