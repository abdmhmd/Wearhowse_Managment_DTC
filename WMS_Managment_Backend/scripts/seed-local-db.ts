import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PASSWORD = 'Admin@123';
const SALT_ROUNDS = 10;

function log(msg: string) { console.log(msg); }
function logStep(label: string, count: number, skipped: number) {
  log(`  ✓ ${label}: ${count} inserted, ${skipped} skipped (already exists)`);
}

async function tableCount(client: PoolClient, table: string): Promise<number> {
  const res = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
  return res.rows[0].total;
}

// ─── Master Data ──────────────────────────────────────────────────────
const CATEGORIES = [
  { code: 'ELEC', name_ar: 'إلكترونيات', name_en: 'Electronics', description: 'All electronic devices and accessories' },
  { code: 'FURN', name_ar: 'أثاث مكتبي', name_en: 'Office Furniture', description: 'Office chairs, desks, and furniture' },
  { code: 'STAT', name_ar: 'قرطاسية', name_en: 'Stationery', description: 'Paper, pens, and office supplies' },
  { code: 'RAW', name_ar: 'مواد خام', name_en: 'Raw Materials', description: 'Unprocessed materials for production' },
  { code: 'FIN', name_ar: 'منتجات تامة', name_en: 'Finished Goods', description: 'Ready-to-sell finished products' },
];

const UNITS = [
  { code: 'PC', name_ar: 'قطعة', name_en: 'Piece' },
  { code: 'BOX', name_ar: 'صندوق', name_en: 'Box' },
  { code: 'CTN', name_ar: 'كرتون', name_en: 'Carton' },
  { code: 'KG', name_ar: 'كيلوغرام', name_en: 'Kilogram' },
  { code: 'M', name_ar: 'متر', name_en: 'Meter' },
  { code: 'L', name_ar: 'لتر', name_en: 'Liter' },
];

const WAREHOUSES = [
  { code: 'WH-MAIN', name_ar: 'المستودع الرئيسي', name_en: 'Main Warehouse', location: 'المبنى الرئيسي - الطابق الأول' },
  { code: 'WH-SEC', name_ar: 'المستودع الثانوي', name_en: 'Secondary Warehouse', location: 'المبنى المجاور - الطابق الثاني' },
];

const DEPARTMENTS = [
  { code: 'IT', name_ar: 'قسم تقنية المعلومات', name_en: 'IT Department' },
  { code: 'HR', name_ar: 'الموارد البشرية', name_en: 'Human Resources' },
  { code: 'OPS', name_ar: 'العمليات', name_en: 'Operations' },
  { code: 'FIN', name_ar: 'المالية', name_en: 'Finance' },
];

const ITEMS = [
  { item_code: 'LAPTOP-PRO', name_ar: 'لابتوب برو', name_en: 'Laptop Pro', description: 'لابتوب أعمال 14 بوصة', category_code: 'ELEC', unit_code: 'PC', warehouse: 'WH-MAIN', min: 10, max: 100, balance: 50, location: 'رف A1' },
  { item_code: 'OFFICE-CHAIR', name_ar: 'كرسي مكتب', name_en: 'Office Chair', description: 'كرسي مكتب مريح قابل للتعديل', category_code: 'FURN', unit_code: 'PC', warehouse: 'WH-MAIN', min: 5, max: 50, balance: 30, location: 'رف B2' },
  { item_code: 'A4-PAPER', name_ar: 'ورق A4', name_en: 'A4 Copy Paper', description: 'ورق نسخ A4 - 500 ورقة', category_code: 'STAT', unit_code: 'BOX', warehouse: 'WH-MAIN', min: 20, max: 200, balance: 100, location: 'رف C1' },
  { item_code: 'USB-C-CABLE', name_ar: 'كابل USB-C', name_en: 'USB-C Cable', description: 'كابل شحن USB-C بطول 1 متر', category_code: 'ELEC', unit_code: 'PC', warehouse: 'WH-SEC', min: 50, max: 500, balance: 200, location: 'رف D3' },
  { item_code: 'WHITEBOARD-MKR', name_ar: 'قلم سبورة', name_en: 'Whiteboard Marker', description: 'قلم سبورة أبيض - عبوة 12 قلم', category_code: 'STAT', unit_code: 'PC', warehouse: 'WH-MAIN', min: 30, max: 300, balance: 150, location: 'رف C2' },
  { item_code: 'OFFICE-DESK', name_ar: 'مكتب مكتب', name_en: 'Office Desk', description: 'مكتب خشبي بمساحة عمل واسعة', category_code: 'FURN', unit_code: 'PC', warehouse: 'WH-MAIN', min: 5, max: 30, balance: 15, location: 'رف B1' },
  { item_code: 'WIRELESS-MOUSE', name_ar: 'ماوس لاسلكي', name_en: 'Wireless Mouse', description: 'ماوس لاسلكي بتقنية البلوتوث', category_code: 'ELEC', unit_code: 'PC', warehouse: 'WH-SEC', min: 20, max: 200, balance: 80, location: 'رف D1' },
  { item_code: 'KEYBOARD', name_ar: 'لوحة مفاتيح', name_en: 'Keyboard', description: 'لوحة مفاتيح مقاومة للماء', category_code: 'ELEC', unit_code: 'PC', warehouse: 'WH-SEC', min: 15, max: 150, balance: 60, location: 'رف D2' },
  { item_code: 'INK-CARTRIDGE', name_ar: 'خرطوشة حبر', name_en: 'Ink Cartridge', description: 'خرطوشة حبر سوداء لطابعة HP', category_code: 'STAT', unit_code: 'PC', warehouse: 'WH-MAIN', min: 10, max: 100, balance: 40, location: 'رف C3' },
];

// ─── Main Seed Logic ──────────────────────────────────────────────────
async function seedLocalDb(): Promise<void> {
  const client = await pool.connect();
  let totalInserted = 0;

  try {
    await client.query('BEGIN');
    log('🚀 Starting local database seeding...\n');

    // ── 1. Categories ───────────────────────────────────────────────
    log('📁 Seeding categories...');
    let catInserted = 0, catSkipped = 0;
    for (const c of CATEGORIES) {
      const existing = await client.query('SELECT code FROM categories WHERE code = $1', [c.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO categories (code, name_ar, name_en, description) VALUES ($1, $2, $3, $4)',
          [c.code, c.name_ar, c.name_en, c.description]
        );
        catInserted++;
      } else {
        catSkipped++;
      }
    }
    logStep('Categories', catInserted, catSkipped);
    totalInserted += catInserted;

    // ── 2. Units ────────────────────────────────────────────────────
    log('📐 Seeding units...');
    let unitInserted = 0, unitSkipped = 0;
    for (const u of UNITS) {
      const existing = await client.query('SELECT code FROM units WHERE code = $1', [u.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $3)',
          [u.code, u.name_ar, u.name_en]
        );
        unitInserted++;
      } else {
        unitSkipped++;
      }
    }
    logStep('Units', unitInserted, unitSkipped);
    totalInserted += unitInserted;

    // ── 3. Warehouses ───────────────────────────────────────────────
    log('🏭 Seeding warehouses...');
    let whInserted = 0, whSkipped = 0;
    for (const w of WAREHOUSES) {
      const existing = await client.query('SELECT code FROM warehouses WHERE code = $1', [w.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO warehouses (code, name_ar, name_en, location) VALUES ($1, $2, $3, $4)',
          [w.code, w.name_ar, w.name_en, w.location]
        );
        whInserted++;
      } else {
        whSkipped++;
      }
    }
    logStep('Warehouses', whInserted, whSkipped);
    totalInserted += whInserted;

    // ── 4. Departments ──────────────────────────────────────────────
    log('🏢 Seeding departments...');
    let deptInserted = 0, deptSkipped = 0;
    for (const d of DEPARTMENTS) {
      const existing = await client.query('SELECT code FROM departments WHERE code = $1', [d.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO departments (code, name_ar, name_en) VALUES ($1, $2, $3)',
          [d.code, d.name_ar, d.name_en]
        );
        deptInserted++;
      } else {
        deptSkipped++;
      }
    }
    logStep('Departments', deptInserted, deptSkipped);
    totalInserted += deptInserted;

    // ── 5. Users ────────────────────────────────────────────────────
    log('👤 Seeding admin user...');
    const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
    let userInserted = 0, userSkipped = 0;
    const existingAdmin = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (existingAdmin.rows.length === 0) {
      await client.query(
        'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES ($1, $2, $3, $4, true)',
        ['admin', passwordHash, 'System Administrator', 'admin']
      );
      userInserted++;
    } else {
      userSkipped++;
    }
    logStep('Users', userInserted, userSkipped);
    totalInserted += userInserted;

    // ── 6. Items ────────────────────────────────────────────────────
    log('📦 Seeding items...');
    const whRows = await client.query('SELECT id, code FROM warehouses');
    const whMap: Record<string, number> = {};
    for (const row of whRows.rows) whMap[row.code] = row.id;

    let itemInserted = 0, itemSkipped = 0;
    for (const i of ITEMS) {
      const existing = await client.query('SELECT id FROM items WHERE item_code = $1', [i.item_code]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO items (item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
          [i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.unit_code, whMap[i.warehouse], i.min, i.max, i.balance, i.location]
        );
        itemInserted++;
      } else {
        itemSkipped++;
      }
    }
    logStep('Items', itemInserted, itemSkipped);
    totalInserted += itemInserted;

    // ── 7. Transactions ─────────────────────────────────────────────
    log('📝 Seeding transactions...');
    await client.query("CREATE SEQUENCE IF NOT EXISTS transaction_no_seq START 1");

    const userRows = await client.query('SELECT id, username FROM users');
    const userMap: Record<string, number> = {};
    for (const row of userRows.rows) userMap[row.username] = row.id;

    const deptRows = await client.query('SELECT id, code FROM departments');
    const deptMap: Record<string, number> = {};
    for (const row of deptRows.rows) deptMap[row.code] = row.id;

    const itemRows = await client.query('SELECT id, item_code FROM items');
    const itemMap: Record<string, number> = {};
    for (const row of itemRows.rows) itemMap[row.item_code] = row.id;

    async function nextTxnNo(type: string): Promise<string> {
      const res = await client.query("SELECT nextval('transaction_no_seq') AS seq");
      const seq = res.rows[0].seq;
      const year = new Date().getFullYear();
      return `${type}-${year}-${String(seq).padStart(6, '0')}`;
    }

    async function getBalance(itemId: number): Promise<number> {
      const res = await client.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
      return parseFloat(res.rows[0].current_balance);
    }

    async function txnExists(type: string, status: string, notes: string): Promise<boolean> {
      const res = await client.query(
        'SELECT id FROM transactions WHERE type = $1 AND status = $2 AND notes = $3 LIMIT 1',
        [type, status, notes]
      );
      return res.rows.length > 0;
    }

    let txnInserted = 0, txnSkipped = 0;

    // ── TXN 1: Approved Receiving (RV) with 3 line items ────────────
    const notes1 = 'استلام أولي من المورد - إلكترونيات';
    if (!(await txnExists('RV', 'approved', notes1))) {
      const txn1No = await nextTxnNo('RV');
      const txn1 = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, warehouse_id, created_by, approved_by, notes)
         VALUES ($1, 'RV', 'approved', $2, $3, $4, $5)
         RETURNING id`,
        [txn1No, whMap['WH-MAIN'], userMap['admin'], userMap['admin'], notes1]
      );
      const txn1Id = txn1.rows[0].id;

      const details1 = [
        { item_code: 'LAPTOP-PRO', qty: 20, price: 3500, batch: 'BAT-2026-001' },
        { item_code: 'USB-C-CABLE', qty: 100, price: 25, batch: 'BAT-2026-002' },
        { item_code: 'WIRELESS-MOUSE', qty: 50, price: 150, batch: 'BAT-2026-003' },
      ];
      for (const d of details1) {
        const itemId = itemMap[d.item_code];
        if (!itemId) { log(`    ⚠ Item ${d.item_code} not found — skipping detail`); continue; }
        const before = await getBalance(itemId);
        await client.query(
          'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
          [txn1Id, itemId, d.qty, 'PC', d.price, d.batch]
        );
        const after = before + d.qty;
        await client.query('UPDATE items SET current_balance = $1 WHERE id = $2', [after, itemId]);
        await client.query(
          `INSERT INTO stock_movements (item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, user_id)
           VALUES ($1, $2, 'IN', $3, $4, $5, $6)`,
          [itemId, txn1Id, before, d.qty, after, userMap['admin']]
        );
      }
      txnInserted++;
      log(`    ✓ TXN-1: Approved Receiving (${txn1No}) — 3 items`);
    } else {
      txnSkipped++;
      log('    ⊘ TXN-1: Approved Receiving already exists — skipped');
    }

    // ── TXN 2: Draft Issuing (LN) with 2 line items ─────────────────
    const notes2 = 'صرف أثاث لقسم العمليات - مسودة';
    if (!(await txnExists('LN', 'draft', notes2))) {
      const txn2No = await nextTxnNo('LN');
      const txn2 = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, department_id, warehouse_id, created_by, notes)
         VALUES ($1, 'LN', 'draft', $2, $3, $4, $5)
         RETURNING id`,
        [txn2No, deptMap['OPS'], whMap['WH-MAIN'], userMap['admin'], notes2]
      );
      const txn2Id = txn2.rows[0].id;

      const details2 = [
        { item_code: 'OFFICE-CHAIR', qty: 5, price: 800, batch: null },
        { item_code: 'WHITEBOARD-MKR', qty: 20, price: 15, batch: null },
      ];
      for (const d of details2) {
        const itemId = itemMap[d.item_code];
        if (!itemId) { log(`    ⚠ Item ${d.item_code} not found — skipping detail`); continue; }
        await client.query(
          'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
          [txn2Id, itemId, d.qty, 'PC', d.price, d.batch]
        );
      }
      txnInserted++;
      log(`    ✓ TXN-2: Draft Issuing (${txn2No}) — 2 items`);
    } else {
      txnSkipped++;
      log('    ⊘ TXN-2: Draft Issuing already exists — skipped');
    }

    logStep('Transactions', txnInserted, txnSkipped);
    totalInserted += txnInserted;

    await client.query('COMMIT');

    // ── Final Summary ───────────────────────────────────────────────
    log('\n' + '═'.repeat(60));
    log('  📋 SEEDING COMPLETE');
    log('═'.repeat(60));
    log(`  Total rows inserted: ${totalInserted}`);
    log('');

    const finalCounts = await Promise.all([
      tableCount(client, 'categories'),
      tableCount(client, 'units'),
      tableCount(client, 'warehouses'),
      tableCount(client, 'departments'),
      tableCount(client, 'users'),
      tableCount(client, 'items'),
      tableCount(client, 'transactions'),
      tableCount(client, 'transaction_details'),
      tableCount(client, 'stock_movements'),
    ]);

    log('  📊 Database State:');
    log(`    Categories:        ${finalCounts[0]}`);
    log(`    Units:             ${finalCounts[1]}`);
    log(`    Warehouses:        ${finalCounts[2]}`);
    log(`    Departments:       ${finalCounts[3]}`);
    log(`    Users:             ${finalCounts[4]}`);
    log(`    Items:             ${finalCounts[5]}`);
    log(`    Transactions:      ${finalCounts[6]}`);
    log(`    Txn Details:       ${finalCounts[7]}`);
    log(`    Stock Movements:   ${finalCounts[8]}`);
    log('');
    log('  🔐 Login Credentials:');
    log('  ┌──────────────┬────────────┬─────────────────────┐');
    log('  │ Username     │ Password   │ Role                │');
    log('  ├──────────────┼────────────┼─────────────────────┤');
    log('  │ admin        │ Admin@123  │ admin               │');
    log('  └──────────────┴────────────┴─────────────────────┘');
    log('');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seedLocalDb()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('\n❌ Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });
