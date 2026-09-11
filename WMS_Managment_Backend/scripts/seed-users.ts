import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const EXECUTE = process.argv.includes('--execute');
const EXPECTED_DB = 'dtc_wms';
const SALT_ROUNDS = 10;

interface NewUser {
  username: string;
  full_name: string;
  role: string;
  department_code?: string;
  warehouse_codes?: string[];
}

const NEW_USERS: NewUser[] = [
  { username: 'admin', full_name: 'System Administrator', role: 'admin' },
  { username: 'warehouse.manager1', full_name: 'Ahmad Khaled', role: 'sub_warehouse_manager', warehouse_codes: ['DEMO-WH-1', 'DEMO-WH-2'] },
  { username: 'warehouse.manager2', full_name: 'Omar Hassan', role: 'sub_warehouse_manager', warehouse_codes: ['DEMO-WH-3'] },
  { username: 'department.manager1', full_name: 'Khaled Mahmoud', role: 'department_manager', department_code: 'DEMO-ENG' },
  { username: 'department.manager2', full_name: 'Samer Hassan', role: 'department_manager', department_code: 'DEMO-LAB' },
  { username: 'department.manager3', full_name: 'Nasser Khalil', role: 'department_manager', department_code: 'DEMO-PROD' },
];

// Blocking FKs (RESTRICT / NO ACTION on NOT NULL columns) reassigned by role.
// The legacy roles (storekeeper / accountant / viewer) no longer exist since
// migration 038, so the map only covers the four surviving roles.
const OLD_ROLE_TO_NEW_USERNAME: Record<string, string> = {
  admin: 'admin',
  sub_warehouse_manager: 'warehouse.manager1',
  department_manager: 'department.manager1',
};

const BLOCKING_FK_UPDATES: Array<[string, string]> = [
  ['custodies', 'assigned_to'],
  ['material_requests', 'requested_by'],
  ['projects', 'created_by'],
  ['projects', 'supervisor_id'],
  ['stock_movements', 'user_id'],
  ['transactions', 'created_by'],
];

async function tableCount(client: PoolClient, table: string): Promise<number> {
  const res = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
  return res.rows[0].total;
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    const dbRes = await client.query('SELECT current_database() AS db');
    const dbName = String(dbRes.rows[0].db).toLowerCase();
    if (dbName !== EXPECTED_DB) {
      console.error(`Refusing to run: connected database is "${dbRes.rows[0].db}", expected "${EXPECTED_DB}".`);
      process.exitCode = 1;
      return;
    }

    console.log(`Connected to database: ${dbRes.rows[0].db}`);
    console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)'}`);
    console.log('');

    const beforeUsers = await client.query('SELECT id, username, role FROM users ORDER BY id');
    console.log(`Current users: ${beforeUsers.rows.length}`);
    for (const u of beforeUsers.rows) {
      console.log(`  - ${u.id}: ${u.username} (${u.role})`);
    }
    if (beforeUsers.rows.length === 0) {
      console.log('No users to reset. Nothing to do.');
      return;
    }
    console.log('');

    const roleToOldUser = new Map<string, any>();
    for (const u of beforeUsers.rows) {
      if (!roleToOldUser.has(u.role)) roleToOldUser.set(u.role, u);
    }

    const missingRoles = NEW_USERS
      .map((n) => n.role)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .filter((r) => !roleToOldUser.has(r));
    if (missingRoles.length > 0) {
      console.error(`Safety stop: no existing user with role(s): ${missingRoles.join(', ')}. Cannot map FK references.`);
      process.exitCode = 1;
      return;
    }

    const password = process.env.SEED_USERS_PASSWORD;
    if (!password) {
      console.error('SEED_USERS_PASSWORD environment variable is required (dev password for all new users).');
      process.exitCode = 1;
      return;
    }

    // Dry-run: show the full plan.
    if (!EXECUTE) {
      console.log('Plan:');
      console.log(`  - Create ${NEW_USERS.length} users (roles: ${[...new Set(NEW_USERS.map((n) => n.role))].join(', ')})`);
      console.log(`  - Reassign ${BLOCKING_FK_UPDATES.length} blocking FKs (RESTRICT/NO ACTION, NOT NULL) old->new by role`);
      console.log('  - Delete all existing users (SET NULL columns preserved, CASCADE cleans refresh_tokens/user_warehouses)');
      console.log('  - Assign departments/warehouses for the new users');
      console.log('DRY RUN complete. Re-run with --execute to perform the reset.');
      return;
    }

    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 0. Rename old users whose username collides with a new username (unique constraint).
    const newUsernames = new Set(NEW_USERS.map((n) => n.username));
    for (const u of beforeUsers.rows as any[]) {
      if (newUsernames.has(u.username)) {
        const renamed = `_retired_${u.username}_${u.id}`;
        await client.query('UPDATE users SET username = $1 WHERE id = $2', [renamed, u.id]);
        console.log(`Renamed old user ${u.username} (id ${u.id}) -> ${renamed}`);
      }
    }

    // 1. Reassign blocking FKs old -> new (new users are created with fixed usernames first).
    const newByUsername = new Map<string, number>();
    for (const nu of NEW_USERS) {
      const deptIdRes = nu.department_code
        ? await client.query('SELECT id FROM departments WHERE code = $1', [nu.department_code])
        : null;
      if (nu.department_code && deptIdRes && deptIdRes.rows.length === 0) {
        throw new Error(`Department code ${nu.department_code} not found`);
      }
      const res = await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active, token_version)
         VALUES ($1, $2, $3, $4, $5, true, 0)
         RETURNING id`,
        [nu.username, passwordHash, nu.full_name, nu.role, deptIdRes && deptIdRes.rows.length > 0 ? deptIdRes.rows[0].id : null]
      );
      newByUsername.set(nu.username, res.rows[0].id);
    }
    console.log(`Created ${NEW_USERS.length} users.`);

    // 2. Reassign each blocking FK old->new by role.
    const oldIdToNewId = new Map<number, number>();
    for (const [role, oldUser] of roleToOldUser) {
      const newUsername = OLD_ROLE_TO_NEW_USERNAME[role];
      if (!newUsername || !newByUsername.has(newUsername)) {
        throw new Error(`No mapping target for role ${role}`);
      }
      oldIdToNewId.set(oldUser.id, newByUsername.get(newUsername)!);
    }

    for (const [table, column] of BLOCKING_FK_UPDATES) {
      for (const [oldId, newId] of oldIdToNewId) {
        const res = await client.query(
          `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
          [newId, oldId]
        );
        if (res.rowCount && res.rowCount > 0) {
          console.log(`  reassigned ${table}.${column}: ${res.rowCount} row(s) old#${oldId} -> new#${newId}`);
        }
      }
    }

    // 3. Delete old users (SET NULL columns auto-null; CASCADE cleans tokens/user_warehouses).
    const oldIds = beforeUsers.rows.map((u: any) => u.id);
    const delTokens = await client.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [oldIds]);
    const delUw = await client.query('DELETE FROM user_warehouses WHERE user_id = ANY($1)', [oldIds]);
    console.log(`Cleaned ${delTokens.rowCount} refresh token(s), ${delUw.rowCount} user_warehouses row(s) for old users.`);

    const delUsers = await client.query('DELETE FROM users WHERE id = ANY($1)', [oldIds]);
    console.log(`Deleted ${delUsers.rowCount} old user(s).`);

    // 4. Assign warehouses for new users.
    const whMap = new Map<string, number>();
    const whRows = await client.query('SELECT id, code FROM warehouses');
    for (const w of whRows.rows) whMap.set(w.code, w.id);
    for (const nu of NEW_USERS) {
      if (!nu.warehouse_codes) continue;
      for (const code of nu.warehouse_codes) {
        const whId = whMap.get(code);
        if (!whId) throw new Error(`Warehouse code ${code} not found`);
        await client.query(
          'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2)',
          [newByUsername.get(nu.username)!, whId]
        );
      }
      console.log(`  assigned ${nu.username} -> ${nu.warehouse_codes.join(', ')}`);
    }

    // 5. Safety assertions.
    const usersAfter = await tableCount(client, 'users');
    if (usersAfter !== NEW_USERS.length) {
      throw new Error(`Safety check failed: users count is ${usersAfter}, expected ${NEW_USERS.length}`);
    }
    for (const [table, column] of BLOCKING_FK_UPDATES) {
      const stale = await client.query(
        `SELECT COUNT(*)::int AS total FROM ${table} WHERE ${column} = ANY($1)`,
        [oldIds]
      );
      if (stale.rows[0].total > 0) {
        throw new Error(`Safety check failed: ${table}.${column} still references old user(s)`);
      }
    }

    const untouched = await Promise.all(
      ['categories', 'items', 'units', 'warehouses', 'departments', 'suppliers',
       'transactions', 'transaction_details', 'stock_movements', 'material_requests',
       'projects', 'custodies', 'journal_entries', 'inventory_sessions', 'inventory_counts',
       'alerts', 'batches', 'audit_logs'].map((t) => tableCount(client, t))
    );
    const untouchedNames = ['categories', 'items', 'units', 'warehouses', 'departments', 'suppliers',
      'transactions', 'transaction_details', 'stock_movements', 'material_requests',
      'projects', 'custodies', 'journal_entries', 'inventory_sessions', 'inventory_counts',
      'alerts', 'batches', 'audit_logs'];

    await client.query('COMMIT');
    console.log('');
    console.log('COMMIT successful.');
    console.log('Untouched business data (still intact):');
    for (let i = 0; i < untouched.length; i++) {
      console.log(`  ${untouchedNames[i]}: ${untouched[i]}`);
    }
    console.log('');

    const finalUsers = await client.query(
      'SELECT id, username, full_name, role, department_id, is_active, token_version FROM users ORDER BY id'
    );
    console.log('New users:');
    for (const u of finalUsers.rows) {
      const whs = await client.query(
        'SELECT w.code FROM user_warehouses uw JOIN warehouses w ON w.id = uw.warehouse_id WHERE uw.user_id = $1 ORDER BY w.id',
        [u.id]
      );
      const dept = u.department_id
        ? (await client.query('SELECT code FROM departments WHERE id = $1', [u.department_id])).rows[0]?.code
        : null;
      console.log(`  ${u.id}: ${u.username} | ${u.role} | dept=${dept ?? 'NULL'} | wh=[${whs.rows.map((w) => w.code).join(', ')}] | active=${u.is_active} | token_version=${u.token_version}`);
    }
  } catch (err: any) {
    console.error('');
    console.error('ERROR — rolling back:');
    console.error(`  ${err.message}`);
    await client.query('ROLLBACK');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
