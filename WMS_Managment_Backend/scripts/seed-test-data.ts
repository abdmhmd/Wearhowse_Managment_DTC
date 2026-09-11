import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TEST_PASSWORD = 'Admin@123';
const SALT_ROUNDS = 10;

const DEPARTMENTS = [
  { code: 'IT', name_ar: 'قسم تقنية المعلومات', name_en: 'IT Department' },
  { code: 'ENG', name_ar: 'قسم الهندسة', name_en: 'Engineering Department' },
  { code: 'OPS', name_ar: 'قسم العمليات', name_en: 'Operations Department' },
  { code: 'FIN', name_ar: 'قسم المالية', name_en: 'Finance Department' },
];

const WAREHOUSES = [
  { code: 'WH-MAIN', name_ar: 'المستودع الرئيسي', name_en: 'Main Warehouse', location: 'المبنى الرئيسي - الطابق الأول', is_main: true, department_code: 'IT' },
  { code: 'WH-SEC', name_ar: 'المستودع الثانوي', name_en: 'Secondary Warehouse', location: 'المبنى المجاور - الطابق الثاني', is_main: false, department_code: 'ENG' },
  { code: 'WH-DAM', name_ar: 'مستودع التالف', name_en: 'Damaged Goods Warehouse', location: 'المبنى الرئيسي - القبو', is_main: false, department_code: null },
];

const UNITS = [
  { code: 'PC', name_ar: 'قطعة', name_en: 'Piece' },
  { code: 'BOX', name_ar: 'صندوق', name_en: 'Box' },
  { code: 'CTN', name_ar: 'كرتون', name_en: 'Carton' },
  { code: 'KG', name_ar: 'كيلوغرام', name_en: 'Kilogram' },
  { code: 'M', name_ar: 'متر', name_en: 'Meter' },
  { code: 'L', name_ar: 'لتر', name_en: 'Liter' },
];

const CATEGORIES = [
  { code: 'ELEC', name_ar: 'إلكترونيات', name_en: 'Electronics', prefix: 'ELE', parent_code: null },
  { code: 'FURN', name_ar: 'أثاث مكتبي', name_en: 'Office Furniture', prefix: 'FUN', parent_code: null },
  { code: 'STAT', name_ar: 'قرطاسية', name_en: 'Stationery', prefix: 'STN', parent_code: null },
  { code: 'RAW', name_ar: 'مواد خام', name_en: 'Raw Materials', prefix: 'RAW', parent_code: null },
];

// Every role value present in the user_role enum. The legacy roles
// (storekeeper / accountant / viewer) were deactivated by migration 019 and
// cannot log in, but stay active in the DB so they appear in the user list.
const USERS = [
  { username: 'admin', full_name: 'System Administrator', role: 'system_admin', department_code: null, warehouse_codes: null },
  { username: 'wh.manager', full_name: 'Ahmad Khaled', role: 'warehouse_manager', department_code: null, warehouse_codes: ['WH-MAIN', 'WH-SEC'] },
  { username: 'dept.manager', full_name: 'Khaled Mahmoud', role: 'department_manager', department_code: 'IT', warehouse_codes: null },
  { username: 'supervisor.user', full_name: 'Omar Hassan', role: 'supervisor', department_code: 'ENG', warehouse_codes: null },
  { username: 'storekeeper', full_name: 'Legacy Storekeeper', role: 'storekeeper', department_code: 'OPS', warehouse_codes: ['WH-MAIN'] },
  { username: 'accountant', full_name: 'Legacy Accountant', role: 'accountant', department_code: 'FIN', warehouse_codes: null },
  { username: 'viewer', full_name: 'Legacy Viewer', role: 'viewer', department_code: null, warehouse_codes: ['WH-MAIN', 'WH-SEC'] },
];

const ITEMS = [
  { item_code: 'LAPTOP-PRO', name_ar: 'لابتوب برو', name_en: 'Laptop Pro', description: 'لابتوب أعمال 14 بوصة', category_code: 'ELEC', unit_code: 'PC', warehouse_code: 'WH-MAIN', min: 10, max: 100, balance: 50, location: 'رف A1' },
  { item_code: 'OFFICE-CHAIR', name_ar: 'كرسي مكتب', name_en: 'Office Chair', description: 'كرسي مكتب قابل للتعديل', category_code: 'FURN', unit_code: 'PC', warehouse_code: 'WH-MAIN', min: 5, max: 50, balance: 30, location: 'رف B2' },
  { item_code: 'A4-PAPER', name_ar: 'ورق A4', name_en: 'A4 Copy Paper', description: 'ورق نسخ A4 - 500 ورقة', category_code: 'STAT', unit_code: 'BOX', warehouse_code: 'WH-MAIN', min: 20, max: 200, balance: 100, location: 'رف C1' },
  { item_code: 'USB-C-CABLE', name_ar: 'كابل USB-C', name_en: 'USB-C Cable', description: 'كابل شحن USB-C بطول متر واحد', category_code: 'ELEC', unit_code: 'PC', warehouse_code: 'WH-SEC', min: 50, max: 500, balance: 200, location: 'رف D3' },
];

async function tableCount(client: PoolClient, table: string): Promise<number> {
  const res = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
  return res.rows[0].total;
}

async function seedTestData(): Promise<void> {
  const client = await pool.connect();
  const stats: Record<string, number> = {};

  try {
    await client.query('BEGIN');

    // ── 1. Departments ─────────────────────────────────────────────────
    let deptCount = 0;
    for (const d of DEPARTMENTS) {
      const res = await client.query(
        `INSERT INTO departments (code, name_ar, name_en)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en
         RETURNING id`,
        [d.code, d.name_ar, d.name_en]
      );
      if (res) deptCount++;
    }
    const deptRows = await client.query('SELECT id, code FROM departments');
    const deptIds: Record<string, number> = {};
    for (const r of deptRows.rows) deptIds[r.code] = r.id;
    stats['departments'] = await tableCount(client, 'departments');

    // ── 2. Warehouses ─────────────────────────────────────────────────
    for (const w of WAREHOUSES) {
      await client.query(
        `INSERT INTO warehouses (code, name_ar, name_en, location, is_main, department_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
           location = EXCLUDED.location, is_main = EXCLUDED.is_main,
           department_id = EXCLUDED.department_id`,
        [w.code, w.name_ar, w.name_en, w.location, w.is_main, w.department_code ? deptIds[w.department_code] : null]
      );
    }
    const whRows = await client.query('SELECT id, code FROM warehouses');
    const whIds: Record<string, number> = {};
    for (const r of whRows.rows) whIds[r.code] = r.id;
    stats['warehouses'] = await tableCount(client, 'warehouses');

    // ── 3. Units ──────────────────────────────────────────────────────
    for (const u of UNITS) {
      await client.query(
        `INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [u.code, u.name_ar, u.name_en]
      );
    }
    stats['units'] = await tableCount(client, 'units');

    // ── 4. Categories ─────────────────────────────────────────────────
    const catRows = await client.query('SELECT code FROM categories');
    const existingCats = new Set(catRows.rows.map((r) => r.code));
    for (const c of CATEGORIES) {
      if (!existingCats.has(c.code)) {
        await client.query(
          `INSERT INTO categories (code, name_ar, name_en, prefix, parent_code)
           VALUES ($1, $2, $3, $4, $5)`,
          [c.code, c.name_ar, c.name_en, c.prefix, c.parent_code]
        );
      }
    }
    stats['categories'] = await tableCount(client, 'categories');

    // ── 5. Users (all roles) ──────────────────────────────────────────
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
    let userCount = 0;
    for (const u of USERS) {
      const res = await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           department_id = EXCLUDED.department_id,
           is_active = true
         RETURNING id`,
        [u.username, passwordHash, u.full_name, u.role, u.department_code ? deptIds[u.department_code] : null]
      );
      if (res) userCount++;
    }
    stats['users'] = await tableCount(client, 'users');

    // ── 6. Warehouse assignments (user_warehouses) ────────────────────
    const userRows = await client.query('SELECT id, username FROM users');
    const userIds: Record<string, number> = {};
    for (const r of userRows.rows) userIds[r.username] = r.id;

    let assignmentCount = 0;
    for (const u of USERS) {
      if (!u.warehouse_codes) continue;
      for (const wcode of u.warehouse_codes) {
        const res = await client.query(
          `INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2)
           ON CONFLICT (user_id, warehouse_id) DO NOTHING`,
          [userIds[u.username], whIds[wcode]]
        );
        if (res.rowCount && res.rowCount > 0) assignmentCount++;
      }
    }
    stats['user_warehouses'] = assignmentCount;

    // ── 7. Items ──────────────────────────────────────────────────────
    for (const i of ITEMS) {
      await client.query(
        `INSERT INTO items (item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id,
                            min_stock_level, max_stock_level, current_balance, location, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
         ON CONFLICT (item_code) DO UPDATE SET
           name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
           description = EXCLUDED.description, category_code = EXCLUDED.category_code,
           unit_code = EXCLUDED.unit_code, warehouse_id = EXCLUDED.warehouse_id,
           min_stock_level = EXCLUDED.min_stock_level, max_stock_level = EXCLUDED.max_stock_level,
           current_balance = EXCLUDED.current_balance, location = EXCLUDED.location,
           is_active = true`,
        [i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.unit_code, whIds[i.warehouse_code],
         i.min, i.max, i.balance, i.location]
      );
    }
    stats['items'] = await tableCount(client, 'items');

    await client.query('COMMIT');

    // ── 8. Summary ────────────────────────────────────────────────────
    console.log('═'.repeat(60));
    console.log('  TEST DATA SEEDING COMPLETE');
    console.log('═'.repeat(60));
    for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(18)} ${v}`);

    const roles = await client.query('SELECT DISTINCT role FROM users ORDER BY role');
    console.log('\n  Roles covered:');
    for (const r of roles.rows) console.log(`    - ${r.role}`);

    console.log('\n  Credentials (all users, active roles can log in):');
    console.log('  username          | role                | can login');
    console.log('  ' + '-'.repeat(52));
    for (const u of await client.query('SELECT username, role FROM users ORDER BY role').then((r) => r.rows)) {
      const canLogin = ['system_admin', 'warehouse_manager', 'department_manager', 'supervisor'].includes(u.role);
      console.log(`  ${u.username.padEnd(17)}| ${u.role.padEnd(19)}| ${canLogin ? 'yes' : 'no (legacy)'}`);
    }
    console.log(`\n  Password: ${TEST_PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seedTestData()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('\n❌ Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });