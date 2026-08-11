import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ============================================================================
// reset-demo-environment.ts
//
// Resets the DEMO environment to a clean, minimal state inside the DTC_WMS
// (development) database ONLY:
//
//   * Deletes every demo/test user except the system administrator.
//   * Deletes the old demo departments, warehouses and ALL data that
//     references them (items, stock, transactions, movements, batches,
//     projects, requests, custodies, inventory sessions, journal entries,
//     locations, unit conversions, refresh tokens).
//   * PRESERVES master / system data: categories, subcategories, units,
//     suppliers, system_settings, roles/permissions/role_permissions,
//     migrations, and the audit trail (audit_logs.user_id is NULLed by the
//     existing ON DELETE SET NULL FK — history stays intact).
//   * Creates exactly TWO departments, each with ONE active main warehouse:
//       DEMO-ENG : قسم الهندسة / Engineering Department
//       DEMO-IT  : قسم تقنية المعلومات / Information Technology Department
//   * Creates exactly TWO warehouse managers, each assigned to their own
//     department's main warehouse only (user_warehouses scoping):
//       warehouse.manager1 -> DEMO-MAIN-ENG (Engineering)
//       warehouse.manager2 -> DEMO-MAIN-IT  (Information Technology)
//
// SAFETY:
//   * Refuses to run against any database other than dtc_wms (dev).
//   * Refuses to run when it detects non-demo master rows it is not allowed
//     to delete (guards against deleting unknown/real data).
//   * Never deletes the system_admin account.
//   * Never touches migrations, RBAC tables, or system settings.
//   * Backs up every affected table to backups/ as JSON before deleting.
//   * Fully idempotent: running --execute twice yields the same end state.
//
// Usage:
//   ts-node scripts/reset-demo-environment.ts            # dry run (default)
//   ts-node scripts/reset-demo-environment.ts --execute  # backup + apply
// ============================================================================

const EXECUTE = process.argv.includes('--execute');
const DEV_DB = 'dtc_wms';
const DEMO_PASSWORD = 'Admin@123';
const SALT_ROUNDS = 10;

// ---- Target topology -------------------------------------------------------
const DEPARTMENTS = [
  { code: 'DEMO-ENG', name_ar: 'قسم الهندسة', name_en: 'Engineering Department' },
  { code: 'DEMO-IT', name_ar: 'قسم تقنية المعلومات', name_en: 'Information Technology Department' },
];

const WAREHOUSES = [
  { code: 'DEMO-MAIN-ENG', name_ar: 'المخزن الرئيسي - قسم الهندسة', name_en: 'Engineering Main Warehouse', department_code: 'DEMO-ENG', is_main: true },
  { code: 'DEMO-MAIN-IT', name_ar: 'المخزن الرئيسي - قسم تقنية المعلومات', name_en: 'Information Technology Main Warehouse', department_code: 'DEMO-IT', is_main: true },
];

const MANAGERS = [
  { username: 'warehouse.manager1', full_name: 'Engineering Warehouse Manager', department_code: 'DEMO-ENG', warehouse_code: 'DEMO-MAIN-ENG' },
  { username: 'warehouse.manager2', full_name: 'Information Technology Warehouse Manager', department_code: 'DEMO-IT', warehouse_code: 'DEMO-MAIN-IT' },
];

// ---- Tables fully emptied (child -> parent order, derived from the FK graph)
const TABLES_TO_CLEAR = [
  'alerts',
  'inventory_counts',
  'inventory_sessions',
  'journal_entries',
  'stock_movements',
  'transaction_details',
  'batches',
  'custodies',
  'material_request_details',
  'material_requests',
  'project_students',
  'projects',
  'unit_conversions',
  'item_warehouse_stock',
  'locations',
  'user_warehouses',
  'refresh_tokens',
  'transactions',
  'items',
];

// Table-level guards: only allowed to wipe these when ALL rows match a demo
// pattern (or belong to the target topology). Protects against unknown data.
const TABLE_GUARDS: Array<{ table: string; column: string; demoPattern: RegExp; extra: string }> = [
  { table: 'departments', column: 'code', demoPattern: /^DEMO-/i, extra: "Target codes: DEMO-ENG / DEMO-IT" },
  { table: 'warehouses', column: 'code', demoPattern: /^DEMO-/i, extra: "Target codes: DEMO-MAIN-ENG / DEMO-MAIN-IT" },
  { table: 'items', column: 'item_code', demoPattern: /^(DEMO-|CHM-)/i, extra: 'All items must be demo stock (DEMO-* / CHM-*)' },
];

// Identity sequences reset after the table is fully emptied.
const SEQUENCE_TABLES = [
  'alerts', 'batches', 'custodies', 'inventory_counts', 'inventory_sessions',
  'item_warehouse_stock', 'items', 'journal_entries', 'locations',
  'material_request_details', 'material_requests', 'project_students', 'projects',
  'refresh_tokens', 'stock_movements', 'transaction_details', 'transactions',
  'unit_conversions', 'user_warehouses',
];

const NUMBERING_SEQS = ['transaction_no_seq', 'request_no_seq', 'project_no_seq', 'inventory_session_no_seq'];

const PRESERVED_TABLES = [
  'categories', 'subcategories', 'units', 'suppliers', 'system_settings',
  'roles', 'permissions', 'role_permissions', 'audit_logs',
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function log(msg = '') {
  console.log(msg);
}

async function count(client: PoolClient, sql: string, params: any[] = []): Promise<number> {
  const res = await client.query(sql, params);
  return Number(res.rows[0].total);
}

async function tableCount(client: PoolClient, table: string): Promise<number> {
  return count(client, `SELECT COUNT(*)::int AS total FROM ${table}`);
}

// ---- Backup ----------------------------------------------------------------
async function writeBackup(client: PoolClient): Promise<string> {
  const backupDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(backupDir, `demo-reset-backup-${stamp}.json`);

  const dump: Record<string, any> = {
    database: 'DTC_WMS',
    created_at: new Date().toISOString(),
    note: 'Pre-reset backup of all rows that are deleted by scripts/reset-demo-environment.ts --execute',
  };

  const tables = [...TABLES_TO_CLEAR, 'users', 'departments', 'warehouses'];
  for (const t of tables) {
    const res = await client.query(`SELECT * FROM ${t} ORDER BY 1`);
    dump[t] = res.rows;
  }
  fs.writeFileSync(file, JSON.stringify(dump, null, 2));
  return file;
}

// ---- Safety guards ---------------------------------------------------------
async function runGuards(client: PoolClient): Promise<void> {
  for (const g of TABLE_GUARDS) {
    const res = await client.query(`SELECT ${g.column} FROM ${g.table} ORDER BY 1`);
    const offenders = res.rows
      .map((r: any) => String(r[g.column]))
      .filter((code: string) => !g.demoPattern.test(code));
    if (offenders.length > 0) {
      throw new Error(
        `SAFETY STOP (${g.table}): rows not matching demo pattern (${g.demoPattern}): ${offenders.join(', ')}. ${g.extra}`
      );
    }
  }

  const admin = await client.query(
    `SELECT id, username, role FROM users WHERE username = 'admin' AND role = 'system_admin'`
  );
  if (admin.rows.length !== 1) {
    throw new Error('SAFETY STOP: expected exactly one system_admin account "admin". Refusing to proceed.');
  }

  const otherAdmins = await client.query(`SELECT username FROM users WHERE role = 'system_admin' AND username <> 'admin'`);
  if (otherAdmins.rows.length > 0) {
    throw new Error(
      `SAFETY STOP: found additional system_admin account(s) that are not "admin": ${otherAdmins.rows.map((r: any) => r.username).join(', ')}`
    );
  }
}

// ---- Deletion + creation ---------------------------------------------------
async function clearDemoData(client: PoolClient, deleted: Record<string, number>): Promise<void> {
  for (const table of TABLES_TO_CLEAR) {
    const res = await client.query(`DELETE FROM ${table}`);
    deleted[table] = res.rowCount ?? 0;
    log(`    deleted ${deleted[table]} row(s) from ${table}`);
  }

  // Warehouses first: deleting departments would ON DELETE SET NULL
  // warehouses.department_id and collide with the partial unique index
  // uq_warehouses_main_per_department (all main warehouses -> COALESCE(0)).
  const delWhs = await client.query(`DELETE FROM warehouses`);
  const delDepts = await client.query(`DELETE FROM departments`);
  deleted['warehouses'] = delWhs.rowCount ?? 0;
  deleted['departments'] = delDepts.rowCount ?? 0;
  log(`    deleted ${deleted['warehouses']} row(s) from warehouses`);
  log(`    deleted ${deleted['departments']} row(s) from departments`);

  const delUsers = await client.query(
    `DELETE FROM users WHERE NOT (username = 'admin' AND role = 'system_admin')`
  );
  deleted['users'] = delUsers.rowCount ?? 0;
  log(`    deleted ${deleted['users']} demo/test user(s) (system_admin "admin" preserved)`);

  const adminAfter = await count(client, `SELECT COUNT(*)::int AS total FROM users WHERE username = 'admin' AND role = 'system_admin'`);
  if (adminAfter !== 1) {
    throw new Error('SAFETY STOP: system_admin "admin" no longer exists after user cleanup.');
  }
  const userTotal = await count(client, `SELECT COUNT(*)::int AS total FROM users`);
  if (userTotal !== 1) {
    throw new Error(`SAFETY STOP: expected exactly 1 user after cleanup, found ${userTotal}.`);
  }
}

async function createTopology(client: PoolClient): Promise<void> {
  const deptIds: Record<string, number> = {};
  for (const d of DEPARTMENTS) {
    await client.query(
      `INSERT INTO departments (code, name_ar, name_en, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, is_active = true`,
      [d.code, d.name_ar, d.name_en]
    );
    const res = await client.query(`SELECT id FROM departments WHERE code = $1`, [d.code]);
    deptIds[d.code] = res.rows[0].id;
    log(`    department ${d.code} (#${deptIds[d.code]}) "${d.name_ar}" / "${d.name_en}" ready`);
  }

  const whIds: Record<string, number> = {};
  for (const w of WAREHOUSES) {
    await client.query(
      `INSERT INTO warehouses (code, name_ar, name_en, is_main, department_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (code) DO UPDATE
         SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
             is_main = EXCLUDED.is_main, department_id = EXCLUDED.department_id, is_active = true`,
      [w.code, w.name_ar, w.name_en, w.is_main, deptIds[w.department_code]]
    );
    const res = await client.query(`SELECT id FROM warehouses WHERE code = $1`, [w.code]);
    whIds[w.code] = res.rows[0].id;
    log(`    warehouse ${w.code} (#${whIds[w.code]}) main=${w.is_main} -> department ${w.department_code}`);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  const userIds: Record<string, number> = {};
  for (const m of MANAGERS) {
    await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active, token_version)
       VALUES ($1, $2, $3, 'warehouse_manager', $4, true, 0)
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
             role = 'warehouse_manager', department_id = EXCLUDED.department_id, is_active = true`,
      [m.username, passwordHash, m.full_name, deptIds[m.department_code]]
    );
    const res = await client.query(`SELECT id FROM users WHERE username = $1`, [m.username]);
    userIds[m.username] = res.rows[0].id;

    await client.query(
      `INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2)
       ON CONFLICT (user_id, warehouse_id) DO NOTHING`,
      [userIds[m.username], whIds[m.warehouse_code]]
    );
    log(`    user ${m.username} (#${userIds[m.username]}) role=warehouse_manager dept=${m.department_code} -> warehouse ${m.warehouse_code}`);
  }
}

async function resetSequences(client: PoolClient): Promise<void> {
  for (const table of SEQUENCE_TABLES) {
    const total = await tableCount(client, table);
    if (total !== 0) continue;
    const seqRes = await client.query(`SELECT pg_get_serial_sequence('public.${table}', 'id') AS seq`);
    if (seqRes.rows[0].seq) {
      await client.query(`SELECT setval($1, 1, false)`, [seqRes.rows[0].seq]);
    }
  }
  for (const seq of NUMBERING_SEQS) {
    await client.query(`SELECT setval($1, 1, false)`, [seq]);
  }
  log('    reset identity + numbering sequences');
}

// ---- Validation ------------------------------------------------------------
async function validate(client: PoolClient): Promise<void> {
  log('');
  log('═══════════════════════════════════════════════════════');
  log('  VALIDATION');
  log('═══════════════════════════════════════════════════════');

  log('');
  log('Users:');
  const users = await client.query(
    `SELECT id, username, role, department_id, is_active FROM users ORDER BY id`
  );
  for (const u of users.rows) log(`  ${JSON.stringify(u)}`);

  log('');
  log('Departments:');
  const depts = await client.query(
    `SELECT d.id, d.code, d.name_ar, d.name_en, d.is_active,
            (SELECT u.username FROM users u WHERE u.department_id = d.id AND u.role = 'warehouse_manager' LIMIT 1) AS manager
       FROM departments d ORDER BY d.id`
  );
  for (const d of depts.rows) log(`  ${JSON.stringify(d)}`);

  log('');
  log('Warehouses:');
  const whs = await client.query(
    `SELECT w.id, w.code, w.name_ar, w.name_en, w.department_id, w.is_main, w.is_active
       FROM warehouses w ORDER BY w.id`
  );
  for (const w of whs.rows) log(`  ${JSON.stringify(w)}`);

  log('');
  log('User warehouse assignments:');
  const uw = await client.query(
    `SELECT u.username, uw.warehouse_id, w.code AS warehouse_code, w.name_en AS warehouse_name,
            d.code AS warehouse_department
       FROM user_warehouses uw
       JOIN users u ON u.id = uw.user_id
       JOIN warehouses w ON w.id = uw.warehouse_id
       JOIN departments d ON d.id = w.department_id
      ORDER BY u.username`
  );
  for (const r of uw.rows) log(`  ${JSON.stringify(r)}`);

  const checks: Array<{ label: string; sql: string; expectRows: number }> = [
    {
      label: 'Exactly 3 users (1 system_admin + 2 warehouse managers)',
      sql: `SELECT u.username, u.role FROM users u ORDER BY u.id`,
      expectRows: 3,
    },
    {
      label: 'Exactly 1 system_admin account (admin)',
      sql: `SELECT username FROM users WHERE role = 'system_admin'`,
      expectRows: 1,
    },
    {
      label: 'Exactly 2 departments (DEMO-ENG / DEMO-IT)',
      sql: `SELECT code FROM departments ORDER BY code`,
      expectRows: 2,
    },
    {
      label: 'Exactly 2 active main warehouses (one per department)',
      sql: `SELECT w.code FROM warehouses w WHERE w.is_main = true AND w.is_active = true ORDER BY w.code`,
      expectRows: 2,
    },
    {
      label: 'Every department has exactly 1 active main warehouse',
      sql: `SELECT d.code, COUNT(w.id)::int AS cnt
              FROM departments d
              LEFT JOIN warehouses w ON w.department_id = d.id AND w.is_main AND w.is_active
             GROUP BY d.code
             HAVING COUNT(w.id) <> 1`,
      expectRows: 0,
    },
    {
      label: 'No warehouse_manager without a department',
      sql: `SELECT username FROM users WHERE role = 'warehouse_manager' AND is_active AND department_id IS NULL`,
      expectRows: 0,
    },
    {
      label: 'No warehouse_manager with zero assigned warehouses',
      sql: `SELECT u.username FROM users u
             WHERE u.role = 'warehouse_manager' AND u.is_active
               AND NOT EXISTS (SELECT 1 FROM user_warehouses uw WHERE uw.user_id = u.id)`,
      expectRows: 0,
    },
    {
      label: 'No assigned warehouse belongs to a department other than its manager',
      sql: `SELECT u.username, w.code FROM users u
              JOIN user_warehouses uw ON uw.user_id = u.id
              JOIN warehouses w ON w.id = uw.warehouse_id
             WHERE u.role = 'warehouse_manager' AND u.is_active
               AND w.department_id IS DISTINCT FROM u.department_id`,
      expectRows: 0,
    },
    {
      label: 'warehouse.manager1 assigned ONLY to DEMO-MAIN-ENG (Engineering)',
      sql: `SELECT w.code FROM user_warehouses uw
              JOIN users u ON u.id = uw.user_id
              JOIN warehouses w ON w.id = uw.warehouse_id
             WHERE u.username = 'warehouse.manager1'
               AND w.code <> 'DEMO-MAIN-ENG'`,
      expectRows: 0,
    },
    {
      label: 'warehouse.manager2 assigned ONLY to DEMO-MAIN-IT (Information Technology)',
      sql: `SELECT w.code FROM user_warehouses uw
              JOIN users u ON u.id = uw.user_id
              JOIN warehouses w ON w.id = uw.warehouse_id
             WHERE u.username = 'warehouse.manager2'
               AND w.code <> 'DEMO-MAIN-IT'`,
      expectRows: 0,
    },
    {
      label: 'No transactions exist outside the clean state (demo transactions removed)',
      sql: `SELECT transaction_no FROM transactions`,
      expectRows: 0,
    },
    {
      label: 'No material requests remain (demo requests removed)',
      sql: `SELECT request_no FROM material_requests`,
      expectRows: 0,
    },
    {
      label: 'No projects remain (demo projects removed)',
      sql: `SELECT project_no FROM projects`,
      expectRows: 0,
    },
    {
      label: 'No stock/items remain (demo stock removed)',
      sql: `SELECT item_code FROM items`,
      expectRows: 0,
    },
    {
      label: 'warehouse_manager role: no items:create (business rule)',
      sql: `SELECT p.code FROM role_permissions rp
              JOIN roles r ON r.id = rp.role_id
              JOIN permissions p ON p.id = rp.permission_id
             WHERE r.code = 'warehouse_manager' AND p.code = 'items:create'`,
      expectRows: 0,
    },
    {
      label: 'warehouse_manager role: no categories:create (business rule)',
      sql: `SELECT p.code FROM role_permissions rp
              JOIN roles r ON r.id = rp.role_id
              JOIN permissions p ON p.id = rp.permission_id
             WHERE r.code = 'warehouse_manager' AND p.code = 'categories:create'`,
      expectRows: 0,
    },
    {
      label: 'warehouse_manager role: no items:update / categories:update (master catalog read-only)',
      sql: `SELECT p.code FROM role_permissions rp
              JOIN roles r ON r.id = rp.role_id
              JOIN permissions p ON p.id = rp.permission_id
             WHERE r.code = 'warehouse_manager' AND p.code IN ('items:update', 'categories:update')`,
      expectRows: 0,
    },
    {
      label: 'warehouse_manager role: has projects:create (project ownership business rule)',
      sql: `SELECT p.code FROM role_permissions rp
              JOIN roles r ON r.id = rp.role_id
              JOIN permissions p ON p.id = rp.permission_id
             WHERE r.code = 'warehouse_manager' AND p.code = 'projects:create'`,
      expectRows: 1,
    },
  ];

  let failures = 0;
  for (const c of checks) {
    const res = await client.query(c.sql);
    if (res.rowCount === c.expectRows) {
      log(`  [PASS] ${c.label}`);
    } else {
      failures += 1;
      log(`  [FAIL] ${c.label} (expected ${c.expectRows} row(s), got ${res.rowCount})`);
      for (const r of res.rows) log(`         ${JSON.stringify(r)}`);
    }
  }

  log('');
  if (failures === 0) {
    log('All validation checks passed.');
  } else {
    throw new Error(`${failures} validation check(s) failed.`);
  }
}

// ---- Main ------------------------------------------------------------------
async function main(): Promise<void> {
  const client = await pool.connect();
  let inTxn = false;
  try {
    const dbRes = await client.query('SELECT current_database() AS db');
    const dbName = String(dbRes.rows[0].db).toLowerCase();
    if (dbName !== DEV_DB) {
      console.error(`Refusing to run: connected database is "${dbRes.rows[0].db}", expected "${DEV_DB}" (development only).`);
      process.exitCode = 1;
      return;
    }

    log(`Connected to database: ${dbRes.rows[0].db} (dev)`);
    log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)'}`);
    log('');

    await runGuards(client);

    log('Current state:');
    const curUsers = await client.query(
      `SELECT id, username, role, department_id, is_active FROM users ORDER BY id`
    );
    for (const u of curUsers.rows) log(`  user ${u.id}: ${u.username} (${u.role}, dept=${u.department_id}, active=${u.is_active})`);
    const curDepts = await client.query(`SELECT id, code, name_ar FROM departments ORDER BY id`);
    for (const d of curDepts.rows) log(`  department ${d.id}: ${d.code} (${d.name_ar})`);
    const curWhs = await client.query(
      `SELECT w.id, w.code, w.is_main, w.department_id FROM warehouses w ORDER BY w.id`
    );
    for (const w of curWhs.rows) log(`  warehouse ${w.id}: ${w.code} (main=${w.is_main}, dept=${w.department_id})`);
    log('');

    log('Before -> delete -> after plan:');
    log('┌───────────────────────────────┬─────────┬──────────┬──────────┐');
    log('│ table                         │  before │   delete │    after │');

    const before: Record<string, number> = {};
    const delPlan: Record<string, number> = {};
    for (const table of TABLES_TO_CLEAR) {
      const total = await tableCount(client, table);
      before[table] = total;
      delPlan[table] = total;
    }
    before['warehouses'] = await tableCount(client, 'warehouses');
    before['departments'] = await tableCount(client, 'departments');
    before['users'] = await tableCount(client, 'users');
    delPlan['warehouses'] = before['warehouses'];
    delPlan['departments'] = before['departments'];
    delPlan['users'] = before['users'] - 1;

    for (const table of [...TABLES_TO_CLEAR, 'warehouses', 'departments', 'users']) {
      const b = before[table];
      const d = delPlan[table];
      log(
        `│ ${table.padEnd(29)} │ ${String(b).padStart(7)} │ ${String(d).padStart(8)} │ ${String(b - d).padStart(8)} │`
      );
    }
    log('└───────────────────────────────┴─────────┴──────────┴──────────┘');

    log('');
    log('Preserved (not touched):');
    for (const t of PRESERVED_TABLES) {
      log(`  ${t} (${await tableCount(client, t)} rows) — kept`);
    }
    log('  audit_logs: kept (historical trail). demo user references become NULL via ON DELETE SET NULL.');

    log('');
    log('Target topology:');
    for (const d of DEPARTMENTS) log(`  department ${d.code}: ${d.name_ar} / ${d.name_en}`);
    for (const w of WAREHOUSES) log(`  warehouse ${w.code}: main=${w.is_main} -> ${w.department_code}`);
    for (const m of MANAGERS) log(`  manager ${m.username}: dept=${m.department_code}, warehouse=${m.warehouse_code} (password: ${DEMO_PASSWORD})`);

    if (!EXECUTE) {
      log('');
      log('DRY RUN complete. No changes were made.');
      log('Re-run with --execute to back up and apply.');
      return;
    }

    const backupFile = await writeBackup(client);
    log('');
    log(`Backup written: ${backupFile}`);
    log('');
    log('Executing reset inside a single transaction...');

    await client.query('BEGIN');
    inTxn = true;

    const deleted: Record<string, number> = {};
    await clearDemoData(client, deleted);
    await createTopology(client);
    await resetSequences(client);

    log('');
    log('Final state checks:');
    await validate(client);

    await client.query('COMMIT');
    inTxn = false;
    log('');
    log(`COMMIT successful. Demo environment reset to ${before['users'] - delPlan['users']} admin + 2 managers, 2 departments, 2 main warehouses.`);

    log('');
    log('Demo credentials:');
    log(`  admin               / ${DEMO_PASSWORD} (system_admin) — kept as-is`);
    log(`  warehouse.manager1  / ${DEMO_PASSWORD} (warehouse_manager -> Engineering)`);
    log(`  warehouse.manager2  / ${DEMO_PASSWORD} (warehouse_manager -> Information Technology)`);
  } catch (err: any) {
    if (inTxn) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    console.error('');
    console.error('ERROR — aborting:');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
