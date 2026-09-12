import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const EXECUTE = process.argv.includes('--execute');
const DEV_DB = 'dtc_wms';

const ALL_TABLES = [
  'alerts',
  'batches',
  'categories',
  'custodies',
  'departments',
  'inventory_counts',
  'inventory_sessions',
  'item_warehouse_stock',
  'items',
  'journal_entries',
  'locations',
  'material_request_details',
  'material_requests',
  'projects',
  'refresh_tokens',
  'stock_movements',
  'subcategories',
  'system_settings',
  'transaction_details',
  'transactions',
  'unit_conversions',
  'units',
  'warehouses',
];

// Deletion order is child -> parent, derived from the FK graph.
const DELETE_ORDER: Array<[string, string]> = [
  ['journal_entries', ''],
  ['refresh_tokens', ''],
  ['transaction_details', ''],
  ['stock_movements', ''],
  ['batches', ''],
  ['item_warehouse_stock', ''],
  ['alerts', ''],
  ['inventory_counts', ''],
  ['inventory_sessions', ''],
  ['custodies', ''],
  ['material_request_details', ''],
  ['material_requests', ''],
  ['projects', ''],
  ['transactions', ''],
  ['locations', ''],
  ['items', ''],
  ['subcategories', ''],
  ['categories', ''],
  ['units', ''],
  ['warehouses', ''],
  ['departments', ''],
  ['system_settings', ''],
];

// Serial identity sequences to reset after emptying the tables.
const IDENTITY_SEQ_TABLES = [
  'alerts', 'batches', 'custodies', 'departments', 'inventory_counts',
  'inventory_sessions', 'item_warehouse_stock', 'items', 'journal_entries',
  'locations', 'material_request_details', 'material_requests', 'projects',
  'refresh_tokens', 'stock_movements', 'subcategories',
  'transaction_details', 'transactions', 'unit_conversions', 'warehouses',
];

// Standalone document-numbering sequences.
const NUMBERING_SEQS = [
  'transaction_no_seq', 'request_no_seq', 'project_no_seq', 'inventory_session_no_seq',
];

async function count(client: PoolClient, sql: string, params: any[] = []): Promise<number> {
  const res = await client.query(sql, params);
  return res.rows[0].total;
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    const dbRes = await client.query('SELECT current_database() AS db');
    const dbName = String(dbRes.rows[0].db).toLowerCase();
    if (dbName !== DEV_DB) {
      console.error(`Refusing to run: connected database is "${dbName}", expected "${DEV_DB}".`);
      process.exitCode = 1;
      return;
    }

    const mode = EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)';
    console.log(`Connected to database: ${dbRes.rows[0].db}`);
    console.log(`Mode: ${mode}`);
    console.log('');

    const realUsers = await client.query(
      `SELECT username, role, is_active FROM users WHERE username NOT LIKE 'test\\_%' ORDER BY username`
    );
    const testUserCount = await count(client, `SELECT COUNT(*)::int AS total FROM users WHERE username LIKE 'test\\_%'`);
    const totalUsers = await count(client, `SELECT COUNT(*)::int AS total FROM users`);
    console.log('Real users (will be preserved):');
    for (const u of realUsers.rows) {
      console.log(`  - ${u.username} (role=${u.role}, is_active=${u.is_active})`);
    }
    console.log(`Test users (will be deleted): ${testUserCount} of ${totalUsers} total`);
    console.log('');

    console.log('Before -> after plan:');
    console.log('┌───────────────────────────────┬─────────┬──────────┬──────────┐');
    console.log('│ table                         │  before │   delete │    after │');
    console.log('├───────────────────────────────┼─────────┼──────────┼──────────┤');

    const before: Record<string, number> = {};
    const plan: Record<string, number> = {};
    for (const table of ALL_TABLES) {
      const total = await count(client, `SELECT COUNT(*)::int AS total FROM ${table}`);
      before[table] = total;
      plan[table] = total;
    }
    before['users'] = totalUsers;
    plan['users'] = testUserCount;
    before['_migrations'] = await count(client, 'SELECT COUNT(*)::int AS total FROM _migrations');
    plan['_migrations'] = 0;

    const allNames = [...ALL_TABLES, 'users', '_migrations'];
    for (const table of allNames) {
      const b = before[table];
      const d = plan[table];
      const a = b - d;
      console.log(
        `│ ${table.padEnd(29)} │ ${String(b).padStart(7)} │ ${String(d).padStart(8)} │ ${String(a).padStart(8)} │`
      );
    }
    console.log('└───────────────────────────────┴─────────┴──────────┴──────────┘');

    if (!EXECUTE) {
      console.log('');
      console.log('DRY RUN complete. Re-run with --execute to perform the reset.');
      return;
    }

    console.log('');
    console.log('Executing reset inside a single transaction...');
    await client.query('BEGIN');

    for (const [table, _where] of DELETE_ORDER) {
      const sql = _where ? `DELETE FROM ${table} WHERE ${_where}` : `DELETE FROM ${table}`;
      const res = await client.query(sql);
      console.log(`  deleted ${res.rowCount} from ${table}`);
    }

    // Delete only test user accounts; abort if anything other than test_ users is matched.
    const checkReal = await client.query(
      `SELECT COUNT(*)::int AS total FROM users WHERE username NOT LIKE 'test\\_%'`
    );
    if (checkReal.rows[0].total !== realUsers.rows.length) {
      throw new Error(`SAFETY STOP: real user count changed from ${realUsers.rows.length} to ${checkReal.rows[0].total}`);
    }
    const delUsers = await client.query(`DELETE FROM users WHERE username LIKE 'test\\_%'`);
    console.log(`  deleted ${delUsers.rowCount} from users (test accounts)`);

    // Reset identity sequences.
    for (const table of IDENTITY_SEQ_TABLES) {
      const seqRes = await client.query(`SELECT pg_get_serial_sequence('public.${table}', 'id') AS seq`);
      if (seqRes.rows[0].seq) {
        await client.query(`SELECT setval($1, 1, false)`, [seqRes.rows[0].seq]);
      }
    }
    console.log('  reset identity sequences to 1');

    // Reset document-numbering sequences.
    for (const seq of NUMBERING_SEQS) {
      await client.query(`SELECT setval($1, 1, false)`, [seq]);
    }
    console.log('  reset numbering sequences to 1');

    // Final safety assertion: business tables empty, real users intact.
    for (const table of ALL_TABLES) {
      const remaining = await count(client, `SELECT COUNT(*)::int AS total FROM ${table}`);
      if (remaining !== 0) {
        throw new Error(`Safety check failed: ${table} still has ${remaining} rows`);
      }
    }
    const remainingUsers = await count(client, `SELECT COUNT(*)::int AS total FROM users`);
    if (remainingUsers !== realUsers.rows.length) {
      throw new Error(`Safety check failed: users count is ${remainingUsers}, expected ${realUsers.rows.length}`);
    }

    await client.query('COMMIT');
    console.log('');
    console.log(`COMMIT successful. ${remainingUsers} users preserved (${realUsers.rows.length} real accounts).`);
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
