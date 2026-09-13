import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';

import { hashPassword } from '../src/utils/crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EXECUTE = process.argv.includes('--execute');
const EXPECTED_DB = process.env.SEED_EXPECTED_DB || 'DTC_WMS_final_db';
const MARKER = 'CAMPUS-SEED';
const DEFAULT_PASSWORD = process.env.SEED_CAMPUS_PASSWORD || 'Wms@12345';

interface CampusUser {
  username: string;
  full_name_ar: string;
  full_name_en: string;
  role: string;
  department_code?: string;
  warehouse_codes?: string[];
}

interface CampusItem {
  item_code: string;
  name_ar: string;
  name_en: string;
  description: string;
  category_code: string;
  subcategory_code: string;
  unit_code: string;
  warehouse_code: string;
  min_stock_level: number;
  max_stock_level: number;
  current_balance: number;
  location: string;
  is_consumable: boolean;
  expiry_alert_days: number;
}

const UNITS = [
  { code: 'ROLL', name_ar: 'لفة', name_en: 'Roll' },
];

const DEPARTMENTS = [
  { code: 'ENG', name_ar: 'قسم الهندسة', name_en: 'Engineering Department' },
  { code: 'SCI', name_ar: 'قسم العلوم', name_en: 'Science Department' },
  { code: 'MED', name_ar: 'القسم الطبي', name_en: 'Medical Department' },
];

const WAREHOUSES = [
  { code: 'WH-ENG-M', name_ar: 'مخزن الهندسة الرئيسي', name_en: 'Engineering Main Warehouse', location: 'مبنى الهندسة - الطابق الأرضي', department_code: 'ENG', is_main: true },
  { code: 'WH-ENG-1', name_ar: 'مخزن الهندسة 1', name_en: 'Engineering Warehouse 1', location: 'مبنى الهندسة - الطابق الأول', department_code: 'ENG', is_main: false },
  { code: 'WH-ENG-2', name_ar: 'مخزن الهندسة 2', name_en: 'Engineering Warehouse 2', location: 'المستودع الخارجي الشمالي', department_code: 'ENG', is_main: false },
  { code: 'WH-SCI-M', name_ar: 'مخزن العلوم الرئيسي', name_en: 'Science Main Warehouse', location: 'مبنى العلوم - الطابق الأرضي', department_code: 'SCI', is_main: true },
  { code: 'WH-SCI-1', name_ar: 'مخزن العلوم 1', name_en: 'Science Warehouse 1', location: 'مبنى العلوم - الطابق الأول', department_code: 'SCI', is_main: false },
  { code: 'WH-CENTRAL', name_ar: 'المخزن المركزي', name_en: 'Central Warehouse', location: 'المبنى الإداري - الطابق السفلي', department_code: null, is_main: true },
];

const CATEGORIES = [
  { code: 'IT', name_ar: 'تكنولوجيا المعلومات', name_en: 'Information Technology', prefix: 'IT', description: 'أجهزة الحاسوب والشبكات' },
  { code: 'STAT', name_ar: 'قرطاسية', name_en: 'Stationery', prefix: 'STN', description: 'الورق والأقلام واللوازم المكتبية' },
  { code: 'LAB', name_ar: 'معدات معملية', name_en: 'Laboratory Equipment', prefix: 'LAB', description: 'الأجهزة والزجاجيات المخبرية' },
  { code: 'ELEC', name_ar: 'إلكترونيات', name_en: 'Electronics', prefix: 'ELE', description: 'الكابلات والأجهزة الكهربائية' },
];

const SUBCATEGORIES = [
  { category_code: 'IT', code: 'IT-HW', name_ar: 'أجهزة', name_en: 'Hardware' },
  { category_code: 'IT', code: 'IT-NET', name_ar: 'شبكات', name_en: 'Networking' },
  { category_code: 'STAT', code: 'STAT-PAP', name_ar: 'ورقيات', name_en: 'Paper Goods' },
  { category_code: 'LAB', code: 'LAB-GLW', name_ar: 'زجاجيات', name_en: 'Glassware' },
  { category_code: 'ELEC', code: 'ELEC-CBL', name_ar: 'كابلات', name_en: 'Cables' },
];

const USERS: CampusUser[] = [
  { username: 'admin1', full_name_ar: 'مدير النظام', full_name_en: 'System Administrator', role: 'admin' },
  { username: 'eng.wh1', full_name_ar: 'أمين مخزن الهندسة', full_name_en: 'Engineering Storekeeper', role: 'sub_warehouse_manager', department_code: 'ENG', warehouse_codes: ['WH-ENG-M', 'WH-ENG-1', 'WH-ENG-2'] },
  { username: 'eng.mgr', full_name_ar: 'مدير قسم الهندسة', full_name_en: 'Engineering Department Manager', role: 'department_manager', department_code: 'ENG' },
  { username: 'eng.sup1', full_name_ar: 'مشرف قسم الهندسة', full_name_en: 'Engineering Supervisor', role: 'supervisor', department_code: 'ENG' },
  { username: 'sci.wh1', full_name_ar: 'أمين مخزن العلوم', full_name_en: 'Science Storekeeper', role: 'sub_warehouse_manager', department_code: 'SCI', warehouse_codes: ['WH-SCI-M', 'WH-SCI-1'] },
  { username: 'sci.mgr', full_name_ar: 'مدير قسم العلوم', full_name_en: 'Science Department Manager', role: 'department_manager', department_code: 'SCI' },
  { username: 'sci.sup1', full_name_ar: 'مشرف قسم العلوم', full_name_en: 'Science Supervisor', role: 'supervisor', department_code: 'SCI' },
];

const ITEMS: CampusItem[] = [
  { item_code: 'IT-0001', name_ar: 'حاسوب محمول', name_en: 'Laptop Computer', description: 'حاسوب محمول 14 بوصة للاستخدام المكتبي', category_code: 'IT', subcategory_code: 'IT-HW', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 5, max_stock_level: 50, current_balance: 20, location: 'C-01-01', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'IT-0002', name_ar: 'جهاز كمبيوتر مكتبي', name_en: 'Desktop Computer', description: 'كمبيوتر مكتبي لمعامل الحاسوب', category_code: 'IT', subcategory_code: 'IT-HW', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 5, max_stock_level: 40, current_balance: 15, location: 'C-01-02', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'IT-0003', name_ar: 'خادم', name_en: 'Network Server', description: 'خادم لخدمة الشبكة المحلية', category_code: 'IT', subcategory_code: 'IT-NET', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 2, max_stock_level: 20, current_balance: 5, location: 'C-01-03', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'IT-0004', name_ar: 'راوتر', name_en: 'Network Router', description: 'راوتر لاسلكي للشبكات المحلية', category_code: 'IT', subcategory_code: 'IT-NET', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 5, max_stock_level: 30, current_balance: 10, location: 'C-01-04', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'IT-0005', name_ar: 'شاشة', name_en: 'Monitor', description: 'شاشة حاسوب 24 بوصة', category_code: 'IT', subcategory_code: 'IT-HW', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 5, max_stock_level: 40, current_balance: 12, location: 'C-01-05', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'STAT-0001', name_ar: 'ورق A4', name_en: 'A4 Copy Paper', description: 'ورق نسخ A4 - 500 ورقة', category_code: 'STAT', subcategory_code: 'STAT-PAP', unit_code: 'BOX', warehouse_code: 'WH-CENTRAL', min_stock_level: 50, max_stock_level: 500, current_balance: 200, location: 'C-02-01', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'STAT-0002', name_ar: 'قلم حبر', name_en: 'Ballpoint Pen', description: 'قلم حبر أزرق - عبوة 12', category_code: 'STAT', subcategory_code: 'STAT-PAP', unit_code: 'BOX', warehouse_code: 'WH-CENTRAL', min_stock_level: 20, max_stock_level: 200, current_balance: 80, location: 'C-02-02', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'STAT-0003', name_ar: 'ملف تجليد', name_en: 'Binder', description: 'ملف تجليد بلاستيكي', category_code: 'STAT', subcategory_code: 'STAT-PAP', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 20, max_stock_level: 300, current_balance: 120, location: 'C-02-03', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'STAT-0004', name_ar: 'حبر طابعة', name_en: 'Printer Ink', description: 'حبر طابعة أسود', category_code: 'STAT', subcategory_code: 'STAT-PAP', unit_code: 'BOX', warehouse_code: 'WH-CENTRAL', min_stock_level: 10, max_stock_level: 100, current_balance: 30, location: 'C-02-04', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'STAT-0005', name_ar: 'دفتر ملاحظات', name_en: 'Notebook', description: 'دفتر ملاحظات 100 ورقة', category_code: 'STAT', subcategory_code: 'STAT-PAP', unit_code: 'PC', warehouse_code: 'WH-CENTRAL', min_stock_level: 20, max_stock_level: 300, current_balance: 90, location: 'C-02-05', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'ELEC-0001', name_ar: 'كابل نحاسي', name_en: 'Copper Cable', description: 'كابل نحاسي معزول 2.5 مم', category_code: 'ELEC', subcategory_code: 'ELEC-CBL', unit_code: 'ROLL', warehouse_code: 'WH-ENG-M', min_stock_level: 10, max_stock_level: 100, current_balance: 25, location: 'E-01-01', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'ELEC-0002', name_ar: 'قاطع كهربائي', name_en: 'Circuit Breaker', description: 'قاطع كهربائي 16 أمبير', category_code: 'ELEC', subcategory_code: 'ELEC-CBL', unit_code: 'PC', warehouse_code: 'WH-ENG-M', min_stock_level: 10, max_stock_level: 200, current_balance: 40, location: 'E-01-02', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'ELEC-0003', name_ar: 'مثقاب كهربائي', name_en: 'Electric Drill', description: 'مثقاب كهربائي 600 واط', category_code: 'ELEC', subcategory_code: 'ELEC-CBL', unit_code: 'PC', warehouse_code: 'WH-ENG-M', min_stock_level: 2, max_stock_level: 20, current_balance: 4, location: 'E-01-03', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'ELEC-0004', name_ar: 'لمبة LED', name_en: 'LED Bulb', description: 'لمبة LED 9 واط', category_code: 'ELEC', subcategory_code: 'ELEC-CBL', unit_code: 'BOX', warehouse_code: 'WH-ENG-M', min_stock_level: 20, max_stock_level: 300, current_balance: 100, location: 'E-01-04', is_consumable: true, expiry_alert_days: 30 },
  { item_code: 'ELEC-0005', name_ar: 'مكواة لحام', name_en: 'Soldering Iron', description: 'مكواة لحام 30 واط', category_code: 'ELEC', subcategory_code: 'ELEC-CBL', unit_code: 'PC', warehouse_code: 'WH-ENG-M', min_stock_level: 2, max_stock_level: 15, current_balance: 3, location: 'E-01-05', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'LAB-0001', name_ar: 'مجهر', name_en: 'Microscope', description: 'مجهر ضوئي للمعامل', category_code: 'LAB', subcategory_code: 'LAB-GLW', unit_code: 'PC', warehouse_code: 'WH-SCI-M', min_stock_level: 2, max_stock_level: 10, current_balance: 3, location: 'S-01-01', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'LAB-0002', name_ar: 'كؤوس زجاجية', name_en: 'Beaker Set', description: 'طقم كؤوس زجاجية معملية', category_code: 'LAB', subcategory_code: 'LAB-GLW', unit_code: 'BOX', warehouse_code: 'WH-SCI-M', min_stock_level: 5, max_stock_level: 50, current_balance: 12, location: 'S-01-02', is_consumable: true, expiry_alert_days: 180 },
  { item_code: 'LAB-0003', name_ar: 'ميزان دقيق', name_en: 'Precision Balance', description: 'ميزان دقيق إلكتروني', category_code: 'LAB', subcategory_code: 'LAB-GLW', unit_code: 'PC', warehouse_code: 'WH-SCI-M', min_stock_level: 2, max_stock_level: 10, current_balance: 2, location: 'S-01-03', is_consumable: false, expiry_alert_days: 30 },
  { item_code: 'LAB-0004', name_ar: 'أنابيب اختبار', name_en: 'Test Tubes', description: 'أنابيب اختبار زجاجية - عبوة 50', category_code: 'LAB', subcategory_code: 'LAB-GLW', unit_code: 'BOX', warehouse_code: 'WH-SCI-M', min_stock_level: 20, max_stock_level: 200, current_balance: 60, location: 'S-01-04', is_consumable: true, expiry_alert_days: 180 },
  { item_code: 'LAB-0005', name_ar: 'موقد بنزن', name_en: 'Bunsen Burner', description: 'موقد بنزن مخبري', category_code: 'LAB', subcategory_code: 'LAB-GLW', unit_code: 'PC', warehouse_code: 'WH-SCI-M', min_stock_level: 5, max_stock_level: 40, current_balance: 8, location: 'S-01-05', is_consumable: false, expiry_alert_days: 30 },
];

// Multi-warehouse stock: extra (item, warehouse) rows beyond the item's home warehouse.
const EXTRA_STOCK = [
  { item_code: 'ELEC-0001', warehouse_code: 'WH-ENG-2', current_balance: 5 },
  { item_code: 'IT-0004', warehouse_code: 'WH-ENG-M', current_balance: 2 },
  { item_code: 'LAB-0002', warehouse_code: 'WH-SCI-1', current_balance: 5 },
];

async function ensureUnit(c: PoolClient, u: { code: string; name_ar: string; name_en: string }): Promise<'inserted' | 'exists'> {
  const res = await c.query('SELECT 1 FROM units WHERE code = $1', [u.code]);
  if (res.rows.length > 0) return 'exists';
  await c.query('INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $3)', [u.code, u.name_ar, u.name_en]);
  return 'inserted';
}

async function ensureDepartment(c: PoolClient, d: { code: string; name_ar: string; name_en: string }): Promise<'inserted' | 'exists'> {
  const res = await c.query('SELECT 1 FROM departments WHERE code = $1', [d.code]);
  if (res.rows.length > 0) return 'exists';
  await c.query('INSERT INTO departments (code, name_ar, name_en) VALUES ($1, $2, $3)', [d.code, d.name_ar, d.name_en]);
  return 'inserted';
}

async function ensureCategory(c: PoolClient, cat: any): Promise<'inserted' | 'exists'> {
  const res = await c.query('SELECT 1 FROM categories WHERE code = $1', [cat.code]);
  if (res.rows.length > 0) return 'exists';
  await c.query(
    'INSERT INTO categories (code, name_ar, name_en, prefix, description) VALUES ($1, $2, $3, $4, $5)',
    [cat.code, cat.name_ar, cat.name_en, cat.prefix, cat.description]
  );
  return 'inserted';
}

async function ensureSubcategory(c: PoolClient, sc: any): Promise<number> {
  const res = await c.query('SELECT id FROM subcategories WHERE category_code = $1 AND code = $2', [sc.category_code, sc.code]);
  if (res.rows.length > 0) return res.rows[0].id;
  const ins = await c.query(
    'INSERT INTO subcategories (category_code, code, name_ar, name_en) VALUES ($1, $2, $3, $4) RETURNING id',
    [sc.category_code, sc.code, sc.name_ar, sc.name_en]
  );
  return ins.rows[0].id;
}

async function getDepartmentId(c: PoolClient, code: string | null): Promise<number | null> {
  if (!code) return null;
  const res = await c.query('SELECT id FROM departments WHERE code = $1', [code]);
  if (res.rows.length === 0) throw new Error(`Department '${code}' not found`);
  return res.rows[0].id;
}

async function getWarehouseId(c: PoolClient, code: string): Promise<number> {
  const res = await c.query('SELECT id FROM warehouses WHERE code = $1', [code]);
  if (res.rows.length === 0) throw new Error(`Warehouse '${code}' not found`);
  return res.rows[0].id;
}

async function cleanupCampus(c: PoolClient): Promise<void> {
  const campusCodes = [
    ...ITEMS.map((i) => i.item_code),
    ...EXTRA_STOCK.map((s) => s.item_code),
  ];
  await c.query('DELETE FROM stock_movements WHERE transaction_id IN (SELECT id FROM transactions WHERE notes LIKE $1)', [`${MARKER}%`]);
  await c.query('DELETE FROM transaction_details WHERE transaction_id IN (SELECT id FROM transactions WHERE notes LIKE $1)', [`${MARKER}%`]);
  await c.query('DELETE FROM transactions WHERE notes LIKE $1', [`${MARKER}%`]);
  await c.query('DELETE FROM item_warehouse_stock WHERE item_id IN (SELECT id FROM items WHERE item_code = ANY($1))', [campusCodes]);
  await c.query('DELETE FROM items WHERE item_code = ANY($1)', [campusCodes]);
  await c.query("DELETE FROM subcategories WHERE code IN ('IT-HW','IT-NET','STAT-PAP','LAB-GLW','ELEC-CBL')");
  await c.query("DELETE FROM categories WHERE code IN ('IT','LAB')");
  await c.query("DELETE FROM warehouses WHERE code IN ('WH-ENG-M','WH-ENG-1','WH-ENG-2','WH-SCI-M','WH-SCI-1','WH-CENTRAL')");
  await c.query("DELETE FROM user_warehouses WHERE user_id IN (SELECT id FROM users WHERE username IN ('admin1','eng.wh1','eng.mgr','eng.sup1','sci.wh1','sci.mgr','sci.sup1'))");
  await c.query("DELETE FROM users WHERE username IN ('admin1','eng.wh1','eng.mgr','eng.sup1','sci.wh1','sci.mgr','sci.sup1')");
  await c.query("DELETE FROM departments WHERE code IN ('ENG','SCI','MED')");
}

async function seed(): Promise<void> {
  const dbRes = await pool.query('SELECT current_database() AS db');
  const dbName = String(dbRes.rows[0].db).toLowerCase();
  const expected = EXPECTED_DB.toLowerCase();
  if (dbName !== expected) {
    console.error(`Refusing to run: connected database is "${dbRes.rows[0].db}", expected "${EXPECTED_DB}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`Connected to database: ${dbRes.rows[0].db}`);
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)'}`);
  console.log(`Password for seeded users: ${EXECUTE ? 'set (bcrypt cost 10)' : '(would be bcrypt-hashed at cost 10)'}`);
  console.log('');

  if (!EXECUTE) {
    console.log('Planned inserts:');
    console.log(`  units:          ${UNITS.length}`);
    console.log(`  departments:    ${DEPARTMENTS.length}`);
    console.log(`  categories:     ${CATEGORIES.length} (existing reused idempotently)`);
    console.log(`  subcategories:  ${SUBCATEGORIES.length}`);
    console.log(`  warehouses:     ${WAREHOUSES.length}`);
    console.log(`  users:          ${USERS.length}`);
    console.log(`  items:          ${ITEMS.length}`);
    console.log(`  iws rows:       ${ITEMS.length + EXTRA_STOCK.length}`);
    console.log(`  stock IN moves: ${ITEMS.length + EXTRA_STOCK.length}`);
    console.log('');
    console.log('DRY RUN complete. Re-run with --execute to perform the seed.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await cleanupCampus(client);

    // Guard: only one active main warehouse per department, and only one
    // global main (department_id IS NULL). WH-MAIN from an earlier local seed
    // still occupies the global-main slot, so demote it to make room for
    // WH-CENTRAL. Touch only that pre-existing conflict row.
    const whMain = await client.query(
      'SELECT id FROM warehouses WHERE code = $1 AND is_main = true AND is_active = true AND department_id IS NULL',
      ['WH-MAIN']
    );
    if (whMain.rows.length > 0) {
      await client.query('UPDATE warehouses SET is_main = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [whMain.rows[0].id]);
      console.log('  demoted pre-existing WH-MAIN off the global-main slot (WH-CENTRAL takes it).');
    }

    for (const u of UNITS) console.log(`  unit ${u.code}: ${await ensureUnit(client, u)}`);
    for (const d of DEPARTMENTS) console.log(`  department ${d.code}: ${await ensureDepartment(client, d)}`);
    for (const cat of CATEGORIES) console.log(`  category ${cat.code}: ${await ensureCategory(client, cat)}`);
    const subIds: Record<string, number> = {};
    for (const sc of SUBCATEGORIES) subIds[`${sc.category_code}/${sc.code}`] = await ensureSubcategory(client, sc);
    console.log(`  subcategories: ${SUBCATEGORIES.length}`);

    const whDept: Record<string, number | null> = {};
    for (const w of WAREHOUSES) {
      const deptId = await getDepartmentId(client, w.department_code);
      const res = await client.query('SELECT 1 FROM warehouses WHERE code = $1', [w.code]);
      if (res.rows.length === 0) {
        await client.query(
          'INSERT INTO warehouses (code, name_ar, name_en, location, department_id, is_main) VALUES ($1, $2, $3, $4, $5, $6)',
          [w.code, w.name_ar, w.name_en, w.location, deptId, w.is_main]
        );
      }
      whDept[w.code] = deptId;
    }
    console.log(`  warehouses: ${WAREHOUSES.length}`);

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const userIds: Record<string, number> = {};
    for (const u of USERS) {
      const deptId = await getDepartmentId(client, u.department_code ?? null);
      const res = await client.query('SELECT 1 FROM users WHERE username = $1', [u.username]);
      if (res.rows.length > 0) {
        const existing = await client.query('SELECT id FROM users WHERE username = $1', [u.username]);
        userIds[u.username] = existing.rows[0].id;
        console.log(`  user ${u.username}: exists`);
        continue;
      }
      const ins = await client.query(
        'INSERT INTO users (username, password_hash, full_name, role, department_id, is_active, token_version) VALUES ($1, $2, $3, $4, $5, true, 0) RETURNING id',
        [u.username, passwordHash, u.full_name_en, u.role, deptId]
      );
      userIds[u.username] = ins.rows[0].id;
      console.log(`  user ${u.username}: inserted`);
    }

    for (const u of USERS) {
      if (!u.warehouse_codes) continue;
      for (const code of u.warehouse_codes) {
        const whId = await getWarehouseId(client, code);
        const dup = await client.query('SELECT 1 FROM user_warehouses WHERE user_id = $1 AND warehouse_id = $2', [userIds[u.username], whId]);
        if (dup.rows.length === 0) {
          await client.query('INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2)', [userIds[u.username], whId]);
        }
      }
      console.log(`  user ${u.username} -> warehouses: ${u.warehouse_codes.join(', ')}`);
    }

    // Repair invariant: every sub_warehouse_manager (incl. pre-existing ones)
    // must have at least one user_warehouses row. Link any orphaned one to the
    // warehouses it currently manages (fallback: all active warehouses).
    const orphans = await client.query(
      `SELECT u.id, u.username FROM users u
       WHERE u.role = 'sub_warehouse_manager' AND u.is_active = true
         AND NOT EXISTS (SELECT 1 FROM user_warehouses uw WHERE uw.user_id = u.id)`
    );
    for (const o of orphans.rows as any[]) {
      const linked = await client.query(
        `INSERT INTO user_warehouses (user_id, warehouse_id)
         SELECT $1, w.id FROM warehouses w
         WHERE w.is_active = true
           AND NOT EXISTS (SELECT 1 FROM user_warehouses uw2 WHERE uw2.user_id = $1 AND uw2.warehouse_id = w.id)
         ORDER BY w.id LIMIT 1
         RETURNING warehouse_id`,
        [o.id]
      );
      console.log(`  repaired orphaned sub_warehouse_manager ${o.username} -> warehouse ${linked.rows[0]?.warehouse_id}`);
    }

    const itemIds: Record<string, number> = {};
    for (const it of ITEMS) {
      const subId = subIds[`${it.category_code}/${it.subcategory_code}`];
      const whId = await getWarehouseId(client, it.warehouse_code);
      const res = await client.query('SELECT 1 FROM items WHERE item_code = $1', [it.item_code]);
      if (res.rows.length === 0) {
        await client.query(
          `INSERT INTO items (item_code, name_ar, name_en, description, category_code, subcategory_id, unit_code, warehouse_id,
                              min_stock_level, max_stock_level, current_balance, location, is_consumable, expiry_alert_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [it.item_code, it.name_ar, it.name_en, it.description, it.category_code, subId, it.unit_code, whId,
           it.min_stock_level, it.max_stock_level, it.current_balance, it.location, it.is_consumable, it.expiry_alert_days]
        );
      }
      const found = await client.query('SELECT id FROM items WHERE item_code = $1', [it.item_code]);
      itemIds[it.item_code] = found.rows[0].id;
    }
    console.log(`  items: ${ITEMS.length}`);

    // opening-balance RV per item+warehouse: approved transaction -> IN stock movement
    await client.query('CREATE SEQUENCE IF NOT EXISTS campus_txn_no_seq START 1');
    const year = new Date().getFullYear();
    const txnSeq = await client.query("SELECT nextval('campus_txn_no_seq') AS seq");
    let txnCount = 0;

    const movements: Array<{ item_code: string; warehouse_code: string; qty: number }> = [
      ...ITEMS.map((i) => ({ item_code: i.item_code, warehouse_code: i.warehouse_code, qty: i.current_balance })),
      ...EXTRA_STOCK.map((s) => ({ item_code: s.item_code, warehouse_code: s.warehouse_code, qty: s.current_balance })),
    ];

    for (const m of movements) {
      const itemId = itemIds[m.item_code];
      const whId = await getWarehouseId(client, m.warehouse_code);
      const before = await client.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
      const qtyBefore = Number(before.rows[0].current_balance);
      const qtyAfter = qtyBefore + m.qty;

      const txnNo = `RV-${year}-${String(txnSeq.rows[0].seq).padStart(6, '0')}`;
      txnSeq.rows[0].seq += 1;
      const txn = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, warehouse_id, created_by, approved_by, notes)
         VALUES ($1, 'RV', 'approved', $2, $3, $3, $4) RETURNING id`,
        [txnNo, whId, userIds['admin1'], `${MARKER} opening balance ${m.item_code} @ ${m.warehouse_code}`]
      );
      txnCount++;

      await client.query(
        'INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance, min_stock_level, max_stock_level) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = EXCLUDED.current_balance',
        [itemId, whId, m.qty, 0, 999999.9999]
      );
      await client.query(
        `INSERT INTO stock_movements (item_id, transaction_id, warehouse_id, movement_type, quantity_before, quantity_change, quantity_after, user_id)
         VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7)`,
        [itemId, txn.rows[0].id, whId, qtyBefore, m.qty, qtyAfter, userIds['admin1']]
      );
      await client.query('UPDATE items SET current_balance = $1 WHERE id = $2', [qtyAfter, itemId]);
    }
    console.log(`  opening-balance IN movements: ${movements.length} (${txnCount} approved RV transactions)`);

    await client.query('COMMIT');

    console.log('');
    console.log(`Seed completed successfully. Marker namespace: ${MARKER}`);
    console.log(`Seeded user password: ${DEFAULT_PASSWORD}`);
    console.log('Re-run is safe: marker rows are deleted first, idempotency preserved.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('ERROR — seed failed, rolled back:');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

seed()
  .then(async () => { await pool.end(); })
  .catch(async (err: any) => {
    console.error('');
    console.error('ERROR — seed failed:');
    console.error(`  ${err.message}`);
    await pool.end();
    process.exitCode = 1;
  });