import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PASSWORD = 'Admin@123';
const SALT_ROUNDS = 10;

// ─── Helpers ────────────────────────────────────────────────────────────
function log(msg: string) { console.log(msg); }
function logSummary(label: string, count: number) { log(`  ✓ ${label}: ${count} rows`); }

async function tableCount(client: PoolClient, table: string): Promise<number> {
  const res = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
  return res.rows[0].total;
}

// ─── Master Data ────────────────────────────────────────────────────────
const CATEGORIES = [
  { code: 'ELEC', name_ar: 'إلكترونيات', name_en: 'Electronics' },
  { code: 'FURN', name_ar: 'أثاث مكتبي', name_en: 'Office Furniture' },
  { code: 'STAT', name_ar: 'قرطاسية', name_en: 'Stationery' },
  { code: 'RAW', name_ar: 'مواد خام', name_en: 'Raw Materials' },
  { code: 'FIN', name_ar: 'منتجات تامة', name_en: 'Finished Goods' },
];

const UNITS = [
  { code: 'PC', name_ar: 'قطعة', name_en: 'Piece' },
  { code: 'BOX', name_ar: 'صندوق', name_en: 'Box' },
  { code: 'CTN', name_ar: 'كرتون', name_en: 'Carton' },
  { code: 'KG', name_ar: 'كيلوغرام', name_en: 'Kilogram' },
  { code: 'M', name_ar: 'متر', name_en: 'Meter' },
  { code: 'L', name_ar: 'لتر', name_en: 'Liter' },
];

// WH-MAIN is the IT department's MAIN warehouse (the stock source for IT
// material requests); WH-SEC is IT's receiving warehouse. Under the
// main-warehouse routing model, stock is issued MAIN -> department warehouse.
const WAREHOUSES = [
  { code: 'WH-MAIN', name_ar: 'المستودع الرئيسي', name_en: 'Main Warehouse', location: 'المبنى الرئيسي - الطابق الأول', is_main: true, department: 'IT' },
  { code: 'WH-SEC', name_ar: 'المستودع الثانوي', name_en: 'Secondary Warehouse', location: 'المبنى المجاور - الطابق الثاني', is_main: false, department: 'IT' },
  { code: 'WH-DAM', name_ar: 'مستودع التالف', name_en: 'Damaged Goods Warehouse', location: 'المبنى الرئيسي - القبو', is_main: false, department: null },
];

const SUPPLIERS = [
  { name_ar: 'شركة تكنولوجيا التوريد', name_en: 'TechSupply Co.', phone: '+966501234567', email: 'info@techsupply.com', address: 'الرياض، المملكة العربية السعودية' },
  { name_ar: 'الأثاث العالمي المحدودة', name_en: 'Global Furniture Ltd.', phone: '+966502345678', email: 'sales@globalfurniture.com', address: 'جدة، المملكة العربية السعودية' },
  { name_ar: 'أوفيس مارت', name_en: 'OfficeMart', phone: '+966503456789', email: 'orders@officemart.com', address: 'الدمام، المملكة العربية السعودية' },
  { name_ar: 'الموزعون المحليون', name_en: 'Local Distributors', phone: '+966504567890', email: 'contact@localdist.com', address: 'الخبر، المملكة العربية السعودية' },
];

const DEPARTMENTS = [
  { code: 'IT', name_ar: 'قسم تقنية المعلومات', name_en: 'IT Department' },
  { code: 'HR', name_ar: 'الموارد البشرية', name_en: 'Human Resources' },
  { code: 'OPS', name_ar: 'العمليات', name_en: 'Operations' },
  { code: 'FIN', name_ar: 'المالية', name_en: 'Finance' },
];

const USERS = [
  { username: 'admin', full_name: 'System Administrator', full_name_ar: 'مدير النظام', role: 'admin', department_code: null },
  { username: 'wh_manager', full_name: 'Warehouse Manager', full_name_ar: 'مدير المستودع', role: 'sub_warehouse_manager', department_code: null },
  { username: 'dept_manager', full_name: 'Department Manager', full_name_ar: 'مدير القسم', role: 'department_manager', department_code: 'IT' },
  { username: 'dept_manager_ops', full_name: 'Operations Manager', full_name_ar: 'مدير العمليات', role: 'department_manager', department_code: 'OPS' },
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
  { item_code: 'FOLDING-BOARD', name_ar: 'سبورة قابلة للطي', name_en: 'Folding Whiteboard', description: 'سبورة بيضاء بحجم A1 قابلة للطي', category_code: 'FURN', unit_code: 'PC', warehouse: 'WH-MAIN', min: 2, max: 20, balance: 8, location: 'رف B3' },
  { item_code: 'STAPLER', name_ar: 'دباسة', name_en: 'Stapler', description: 'دباسة مكتبية فولاذية', category_code: 'STAT', unit_code: 'PC', warehouse: 'WH-MAIN', min: 10, max: 100, balance: 35, location: 'رف C4' },
  { item_code: 'PLASTIC-FILE', name_ar: 'مجلد بلاستيكي', name_en: 'Plastic File Folder', description: 'مجلد بلاستيكي A4 - عبوة 50 مجلد', category_code: 'STAT', unit_code: 'CTN', warehouse: 'WH-MAIN', min: 5, max: 50, balance: 25, location: 'رف C5' },
];

// ─── Main Seed Logic ────────────────────────────────────────────────────
async function seedDemoData(): Promise<void> {
  const client = await pool.connect();
  let totalInserted = 0;

  try {
    await client.query('BEGIN');
    log('🚀 Starting demo data seeding...\n');

    // ── 1. Categories ───────────────────────────────────────────────
    log('📁 Seeding categories...');
    let catCount = 0;
    for (const c of CATEGORIES) {
      const existing = await client.query('SELECT code FROM categories WHERE code = $1', [c.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO categories (code, name_ar, name_en) VALUES ($1, $2, $3)',
          [c.code, c.name_ar, c.name_en]
        );
        catCount++;
      }
    }
    logSummary('Categories', catCount);
    totalInserted += catCount;

    // ── 2. Units ────────────────────────────────────────────────────
    log('📐 Seeding units...');
    let unitCount = 0;
    for (const u of UNITS) {
      const existing = await client.query('SELECT code FROM units WHERE code = $1', [u.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $3)',
          [u.code, u.name_ar, u.name_en]
        );
        unitCount++;
      }
    }
    logSummary('Units', unitCount);
    totalInserted += unitCount;

    // ── 3. Warehouses ───────────────────────────────────────────────
    log('🏭 Seeding warehouses...');
    const deptRows = await client.query('SELECT id, code FROM departments');
    const deptMap: Record<string, number> = {};
    for (const row of deptRows.rows) deptMap[row.code] = row.id;

    let whCount = 0;
    for (const w of WAREHOUSES) {
      const existing = await client.query('SELECT code FROM warehouses WHERE code = $1', [w.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO warehouses (code, name_ar, name_en, location, is_main, department_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [w.code, w.name_ar, w.name_en, w.location, w.is_main, w.department ? deptMap[w.department] : null]
        );
        whCount++;
      }
    }
    logSummary('Warehouses', whCount);
    totalInserted += whCount;

    // ── 4. Suppliers ────────────────────────────────────────────────
    log('🤝 Seeding suppliers...');
    let supCount = 0;
    for (const s of SUPPLIERS) {
      const existing = await client.query('SELECT name_ar FROM suppliers WHERE name_ar = $1', [s.name_ar]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO suppliers (name_ar, name_en, phone, email, address) VALUES ($1, $2, $3, $4, $5)',
          [s.name_ar, s.name_en, s.phone, s.email, s.address]
        );
        supCount++;
      }
    }
    logSummary('Suppliers', supCount);
    totalInserted += supCount;

    // ── 5. Departments ──────────────────────────────────────────────
    log('🏢 Seeding departments...');
    let deptCount = 0;
    for (const d of DEPARTMENTS) {
      const existing = await client.query('SELECT code FROM departments WHERE code = $1', [d.code]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO departments (code, name_ar, name_en) VALUES ($1, $2, $3)',
          [d.code, d.name_ar, d.name_en]
        );
        deptCount++;
      }
    }
    logSummary('Departments', deptCount);
    totalInserted += deptCount;

    // ── 6. Users ────────────────────────────────────────────────────
    log('👤 Seeding users...');
    const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
    let userCount = 0;
    for (const u of USERS) {
      const existing = await client.query('SELECT id FROM users WHERE username = $1', [u.username]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO users (username, password_hash, full_name, role, department_id, is_active) VALUES ($1, $2, $3, $4, $5, true)',
          [u.username, passwordHash, u.full_name, u.role, u.department_code ? deptMap[u.department_code] : null]
        );
        userCount++;
      }
    }
    logSummary('Users', userCount);
    totalInserted += userCount;

    // ── 7. Items ────────────────────────────────────────────────────
    log('📦 Seeding items...');
    const whRows = await client.query('SELECT id, code FROM warehouses');
    const whMap: Record<string, number> = {};
    for (const row of whRows.rows) whMap[row.code] = row.id;

    let itemCount = 0;
    for (const i of ITEMS) {
      const existing = await client.query('SELECT id FROM items WHERE item_code = $1', [i.item_code]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO items (item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
          [i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.unit_code, whMap[i.warehouse], i.min, i.max, i.balance, i.location]
        );
        itemCount++;
      }
    }
    logSummary('Items', itemCount);
    totalInserted += itemCount;

    // ── 8. Unit Conversions ─────────────────────────────────────────
    log('🔄 Seeding unit conversions...');
    const itemRows = await client.query('SELECT id, item_code FROM items');
    const itemMap: Record<string, number> = {};
    for (const row of itemRows.rows) itemMap[row.item_code] = row.id;

    const conversions = [
      { item_code: 'A4-PAPER', from: 'BOX', to: 'PC', factor: 10 },
      { item_code: 'PLASTIC-FILE', from: 'CTN', to: 'PC', factor: 50 },
    ];
    let convCount = 0;
    for (const c of conversions) {
      const existing = await client.query(
        'SELECT id FROM unit_conversions WHERE item_id = $1 AND from_unit_code = $2 AND to_unit_code = $3',
        [itemMap[c.item_code], c.from, c.to]
      );
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO unit_conversions (item_id, from_unit_code, to_unit_code, factor) VALUES ($1, $2, $3, $4)',
          [itemMap[c.item_code], c.from, c.to, c.factor]
        );
        convCount++;
      }
    }
    logSummary('Unit Conversions', convCount);
    totalInserted += convCount;

    // ── 9. Transactions ─────────────────────────────────────────────
    log('📝 Seeding transactions...');

    // Create sequence if it doesn't exist
    await client.query("CREATE SEQUENCE IF NOT EXISTS transaction_no_seq START 1");

    const userRows = await client.query('SELECT id, username FROM users');
    const userMap: Record<string, number> = {};
    for (const row of userRows.rows) userMap[row.username] = row.id;

    const supRows = await client.query('SELECT id, name_ar FROM suppliers');
    const supNameToId: Record<string, number> = {};
    for (const row of supRows.rows) supNameToId[row.name_ar] = row.id;

    // Helper to generate transaction number
    async function nextTxnNo(type: string): Promise<string> {
      const res = await client.query("SELECT nextval('transaction_no_seq') AS seq");
      const seq = res.rows[0].seq;
      const year = new Date().getFullYear();
      return `${type}-${year}-${String(seq).padStart(6, '0')}`;
    }

    // Get item current balances for movement tracking
    async function getBalance(itemId: number): Promise<number> {
      const res = await client.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
      return parseFloat(res.rows[0].current_balance);
    }

    // Check for existing demo transactions (by type+status+notes marker)
    async function txnExists(type: string, status: string, notes: string): Promise<boolean> {
      const res = await client.query(
        'SELECT id FROM transactions WHERE type = $1 AND status = $2 AND notes = $3 LIMIT 1',
        [type, status, notes]
      );
      return res.rows.length > 0;
    }

    let txnCount = 0;

    // ── TXN 1: Approved Receiving (RV) ──────────────────────────────
    const notes1 = 'استلام أولي من المورد - إلكترونيات';
    if (!(await txnExists('RV', 'approved', notes1))) {
      const txn1No = await nextTxnNo('RV');
      const txn1 = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, supplier_id, warehouse_id, created_by, approved_by, notes)
         VALUES ($1, 'RV', 'approved', $2, $3, $4, $5, $6)
         RETURNING id`,
        [txn1No, supNameToId['شركة تكنولوجيا التوريد'], whMap['WH-MAIN'], userMap['admin'], userMap['admin'], notes1]
      );
      const txn1Id = txn1.rows[0].id;

      const details1 = [
        { item_code: 'LAPTOP-PRO', qty: 20, price: 3500, batch: 'BAT-2026-001' },
        { item_code: 'USB-C-CABLE', qty: 100, price: 25, batch: 'BAT-2026-002' },
      ];
      for (const d of details1) {
        const itemId = itemMap[d.item_code];
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
      txnCount++;
      log(`    ✓ TXN-1: Approved Receiving (${txn1No}) — 2 items`);
    } else {
      log('    ⊘ TXN-1: Approved Receiving already exists — skipped');
    }

    // ── TXN 2: Approved Issuing (LN) ───────────────────────────────
    const notes2 = 'صرف أثاث لقسم العمليات';
    if (!(await txnExists('LN', 'approved', notes2))) {
      const txn2No = await nextTxnNo('LN');
      const txn2 = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, department_id, warehouse_id, created_by, approved_by, notes)
         VALUES ($1, 'LN', 'approved', $2, $3, $4, $5, $6)
         RETURNING id`,
        [txn2No, deptMap['OPS'], whMap['WH-MAIN'], userMap['admin'], userMap['admin'], notes2]
      );
      const txn2Id = txn2.rows[0].id;

      const details2 = [
        { item_code: 'OFFICE-CHAIR', qty: 5, price: 800, batch: null },
        { item_code: 'WHITEBOARD-MKR', qty: 20, price: 15, batch: null },
      ];
      for (const d of details2) {
        const itemId = itemMap[d.item_code];
        const before = await getBalance(itemId);
        await client.query(
          'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
          [txn2Id, itemId, d.qty, 'PC', d.price, d.batch]
        );
        const after = before - d.qty;
        await client.query('UPDATE items SET current_balance = $1 WHERE id = $2', [after, itemId]);
        await client.query(
          `INSERT INTO stock_movements (item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, user_id)
           VALUES ($1, $2, 'OUT', $3, $4, $5, $6)`,
          [itemId, txn2Id, before, -d.qty, after, userMap['admin']]
        );
      }
      txnCount++;
      log(`    ✓ TXN-2: Approved Issuing (${txn2No}) — 2 items`);
    } else {
      log('    ⊘ TXN-2: Approved Issuing already exists — skipped');
    }

    // ── TXN 3: Draft Receiving (RV) ─────────────────────────────────
    const notes3 = 'استلام مواد قرطاسية - مسودة';
    if (!(await txnExists('RV', 'draft', notes3))) {
      const txn3No = await nextTxnNo('RV');
      const txn3 = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, supplier_id, warehouse_id, created_by, notes)
         VALUES ($1, 'RV', 'draft', $2, $3, $4, $5)
         RETURNING id`,
        [txn3No, supNameToId['أوفيس مارت'], whMap['WH-MAIN'], userMap['admin'], notes3]
      );
      const txn3Id = txn3.rows[0].id;

      await client.query(
        'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
        [txn3Id, itemMap['A4-PAPER'], 50, 'BOX', 35, 'BAT-2026-003']
      );
      await client.query(
        'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
        [txn3Id, itemMap['INK-CARTRIDGE'], 30, 'PC', 120, 'BAT-2026-004']
      );
      txnCount++;
      log(`    ✓ TXN-3: Draft Receiving (${txn3No}) — 2 items`);
    } else {
      log('    ⊘ TXN-3: Draft Receiving already exists — skipped');
    }

    // ── TXN 4: Draft Issuing (LN) ──────────────────────────────────
    const notes4 = 'صرف إلكترونيات لقسم تقنية المعلومات - مسودة';
    if (!(await txnExists('LN', 'draft', notes4))) {
      const txn4No = await nextTxnNo('LN');
      const txn4 = await client.query(
        `INSERT INTO transactions (transaction_no, type, status, department_id, warehouse_id, created_by, notes)
         VALUES ($1, 'LN', 'draft', $2, $3, $4, $5)
         RETURNING id`,
        [txn4No, deptMap['IT'], whMap['WH-SEC'], userMap['admin'], notes4]
      );
      const txn4Id = txn4.rows[0].id;

      await client.query(
        'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
        [txn4Id, itemMap['WIRELESS-MOUSE'], 10, 'PC', 150, null]
      );
      await client.query(
        'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number) VALUES ($1, $2, $3, $4, $5, $6)',
        [txn4Id, itemMap['KEYBOARD'], 10, 'PC', 200, null]
      );
      txnCount++;
      log(`    ✓ TXN-4: Draft Issuing (${txn4No}) — 2 items`);
    } else {
      log('    ⊘ TXN-4: Draft Issuing already exists — skipped');
    }

    logSummary('Transactions (with details + movements)', txnCount);
    totalInserted += txnCount;

    await client.query('COMMIT');

    // ── Final Summary ───────────────────────────────────────────────
    log('\n' + '═'.repeat(60));
    log('  📋 SEEDING COMPLETE');
    log('═'.repeat(60));
    log(`  Total rows inserted: ${totalInserted}`);
    log('');

    // Count final state
    const finalCounts = await Promise.all([
      tableCount(client, 'categories'),
      tableCount(client, 'units'),
      tableCount(client, 'warehouses'),
      tableCount(client, 'suppliers'),
      tableCount(client, 'departments'),
      tableCount(client, 'users'),
      tableCount(client, 'items'),
      tableCount(client, 'unit_conversions'),
      tableCount(client, 'transactions'),
      tableCount(client, 'transaction_details'),
      tableCount(client, 'stock_movements'),
    ]);

    log('  📊 Database State:');
    log(`    Categories:       ${finalCounts[0]}`);
    log(`    Units:            ${finalCounts[1]}`);
    log(`    Warehouses:       ${finalCounts[2]}`);
    log(`    Suppliers:        ${finalCounts[3]}`);
    log(`    Departments:      ${finalCounts[4]}`);
    log(`    Users:            ${finalCounts[5]}`);
    log(`    Items:            ${finalCounts[6]}`);
    log(`    Unit Conversions: ${finalCounts[7]}`);
    log(`    Transactions:     ${finalCounts[8]}`);
    log(`    Txn Details:      ${finalCounts[9]}`);
    log(`    Stock Movements:  ${finalCounts[10]}`);
    log('');
    log('  🔐 Demo Credentials:');
    log('  ┌──────────────┬────────────┬─────────────────────┐');
    log('  │ Username     │ Password   │ Role                │');
    log('  ├──────────────┼────────────┼─────────────────────┤');
    log('  │ admin        │ Admin@123  │ admin               │');
    log('  │ wh_manager   │ Admin@123  │ sub_warehouse_manager │');
    log('  │ dept_manager │ Admin@123  │ department_manager  │');
    log('  └──────────────┴────────────┴─────────────────────┘');
    log('');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────
seedDemoData()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('\n❌ Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });
