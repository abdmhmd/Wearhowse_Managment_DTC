import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const EXECUTE = process.argv.includes('--execute');
const DEV_DB = 'dtc_wms';
const MARKER = 'DEMO-WMS';

const { pool, runInTransaction } = require('../src/config/database');
const { itemsService } = require('../src/modules/items/items.service');
const { transactionsService } = require('../src/modules/transactions/transactions.service');
const { materialRequestsService } = require('../src/modules/material-requests/material-requests.service');
const { custodiesRepository } = require('../src/modules/custodies/custodies.repository');
const { projectsService } = require('../src/modules/projects/projects.service');
const { inventoryService } = require('../src/modules/inventory/inventory.service');
const { batchesRepository } = require('../src/modules/batches/batches.repository');
const { categoriesRepository } = require('../src/modules/categories/categories.repository');
const { subcategoriesRepository } = require('../src/modules/categories/subcategories.repository');
const { unitsRepository } = require('../src/modules/units/units.repository');
const { warehousesRepository } = require('../src/modules/warehouses/warehouses.repository');
const { departmentsRepository } = require('../src/modules/departments/departments.repository');
const { suppliersRepository } = require('../src/modules/suppliers/suppliers.repository');
const { unitConversionsRepository } = require('../src/modules/unit-conversions/unit-conversions.repository');

const UNITS = [
  { code: 'PC', name_ar: 'قطعة', name_en: 'Piece' },
  { code: 'KG', name_ar: 'كيلوجرام', name_en: 'Kilogram' },
  { code: 'ROLL', name_ar: 'لفة', name_en: 'Roll' },
  { code: 'BOX', name_ar: 'كرتونة', name_en: 'Box' },
  { code: 'M', name_ar: 'متر', name_en: 'Meter' },
];

const DEPARTMENTS = [
  { code: 'DEMO-ENG', name_ar: 'إدارة الهندسة', name_en: 'Engineering Department' },
  { code: 'DEMO-LAB', name_ar: 'المعمل الكيميائي', name_en: 'Chemical Laboratory' },
  { code: 'DEMO-QC', name_ar: 'إدارة الجودة', name_en: 'Quality Control Department' },
  { code: 'DEMO-MAINT', name_ar: 'إدارة الصيانة', name_en: 'Maintenance Department' },
  { code: 'DEMO-PROD', name_ar: 'إدارة الإنتاج', name_en: 'Production Department' },
];

const CATEGORIES = [
  { code: 'DEMO-ELEC', name_ar: 'الإلكترونيات والكهرباء', name_en: 'Electronics & Electrical', prefix: 'ELE', description: 'الأصناف الكهربائية والإلكترونية' },
  { code: 'DEMO-HARD', name_ar: 'العدد والمواد', name_en: 'Hardware & Tools', prefix: 'HRD', description: 'العدد اليدوية ومواد التثبيت' },
  { code: 'DEMO-CHEM', name_ar: 'الكيماويات', name_en: 'Chemicals', prefix: 'CHM', description: 'المذيبات والدهانات والمواد الكيميائية' },
  { code: 'DEMO-PKG', name_ar: 'التعبئة والتغليف', name_en: 'Packaging', prefix: 'PKG', description: 'مواد التعبئة والتغليف' },
  { code: 'DEMO-SAFE', name_ar: 'معدات السلامة', name_en: 'Safety Equipment', prefix: 'SFE', description: 'معدات الوقاية الشخصية وأجهزة القياس' },
];

const SUBCATEGORIES = [
  { category_code: 'DEMO-ELEC', code: 'SUB-ELEC-1', name_ar: 'أسلاك وكابلات', name_en: 'Wires & Cables', description: 'الكابلات والأسلاك الكهربائية' },
  { category_code: 'DEMO-HARD', code: 'SUB-HARD-1', name_ar: 'أدوات تثبيت', name_en: 'Fasteners', description: 'المسامير وأدوات التثبيت' },
  { category_code: 'DEMO-CHEM', code: 'SUB-CHEM-1', name_ar: 'الدهانات', name_en: 'Paints', description: 'الدهانات والمذيبات' },
  { category_code: 'DEMO-PKG', code: 'SUB-PKG-1', name_ar: 'أشرطة اللصق', name_en: 'Adhesive Tapes', description: 'أشرطة اللصق ومواد التغليف' },
  { category_code: 'DEMO-SAFE', code: 'SUB-SAFE-1', name_ar: 'أجهزة القياس', name_en: 'Measuring Devices', description: 'أجهزة القياس والفحص' },
];

const WAREHOUSES = [
  { code: 'DEMO-WH-1', name_ar: 'المخزن الرئيسي', name_en: 'Main Warehouse', location: 'المبنى الرئيسي - الدور الأرضي' },
  { code: 'DEMO-WH-2', name_ar: 'مخزن المواد الخام', name_en: 'Raw Materials Warehouse', location: 'المبنى الرئيسي - الدور الأول' },
  { code: 'DEMO-WH-3', name_ar: 'مخزن المنتجات النهائية', name_en: 'Finished Goods Warehouse', location: 'المبنى الرئيسي - الدور الثاني' },
  { code: 'DEMO-WH-4', name_ar: 'مخزن الكيماويات', name_en: 'Chemicals Warehouse', location: 'المستودع الخارجي الشمالي' },
  { code: 'DEMO-WH-5', name_ar: 'مخزن الصيانة', name_en: 'Maintenance Warehouse', location: 'المستودع الخارجي الجنوبي' },
];

const LOCATIONS = [
  { warehouse_code: 'DEMO-WH-1', rack: 'A', shelf: '01', bin: '001', barcode: 'DEMO-LOC-001' },
  { warehouse_code: 'DEMO-WH-2', rack: 'B', shelf: '02', bin: '002', barcode: 'DEMO-LOC-002' },
  { warehouse_code: 'DEMO-WH-3', rack: 'C', shelf: '03', bin: '003', barcode: 'DEMO-LOC-003' },
  { warehouse_code: 'DEMO-WH-4', rack: 'D', shelf: '04', bin: '004', barcode: 'DEMO-LOC-004' },
  { warehouse_code: 'DEMO-WH-5', rack: 'E', shelf: '05', bin: '005', barcode: 'DEMO-LOC-005' },
];

const SUPPLIERS = [
  { name_ar: 'شركة النور للتوريدات', name_en: 'Al-Noor Trading Company', phone: '0112345678', email: 'info@alnoor-trading.example', address: 'المنطقة الصناعية الأولى - القاهرة' },
  { name_ar: 'مجموعة الخليج الصناعية', name_en: 'Gulf Industrial Group', phone: '0118765432', email: 'sales@gulf-industrial.example', address: 'المنطقة الصناعية - جدة' },
  { name_ar: 'مؤسسة الأفق التجارية', name_en: 'Al-Ofoq Trading Establishment', phone: '0123456789', email: 'contact@alofoq-trading.example', address: 'حي الملز - الرياض' },
  { name_ar: 'شركة اليمامة للكهرباء', name_en: 'Al-Yamamah Electric Company', phone: '0551234567', email: 'orders@yamamah-electric.example', address: 'المنطقة الصناعية الثانية - الدمام' },
  { name_ar: 'شركة السلامة الحديثة', name_en: 'Modern Safety Company', phone: '0559876543', email: 'info@modern-safety.example', address: 'المنطقة الصناعية - جدة' },
];

const ITEMS = [
  {
    item_code: 'DEMO-WMS-001', name_ar: 'كابل نحاسي 240 أمبير', name_en: 'Copper Cable 240A',
    description: 'كابل نحاسي معزول للتمديدات الكهربائية', category_code: 'DEMO-ELEC', subcategory_code: 'SUB-ELEC-1',
    unit_code: 'ROLL', warehouse_code: 'DEMO-WH-1', min_stock_level: 20, max_stock_level: 300,
    opening_price: 150, location: 'A-01-001', is_consumable: true, expiry_alert_days: 30,
    sap_material_number: 'SAP-CBL-240', gl_account: '1210-001',
  },
  {
    item_code: 'DEMO-WMS-002', name_ar: 'طلاء أبيض 18 لتر', name_en: 'White Paint 18L',
    description: 'طلاء أكريليك أبيض للدهانات الصناعية', category_code: 'DEMO-CHEM', subcategory_code: 'SUB-CHEM-1',
    unit_code: 'BOX', warehouse_code: 'DEMO-WH-1', min_stock_level: 10, max_stock_level: 120,
    opening_price: 85, location: 'A-02-001', is_consumable: true, expiry_alert_days: 180,
    sap_material_number: 'SAP-PNT-W18', gl_account: '1210-002',
  },
  {
    item_code: 'DEMO-WMS-003', name_ar: 'مسمار فولاذي 5 سم', name_en: 'Steel Nails 5cm',
    description: 'مسامير فولاذية مجلفنة للتثبيت', category_code: 'DEMO-HARD', subcategory_code: 'SUB-HARD-1',
    unit_code: 'KG', warehouse_code: 'DEMO-WH-1', min_stock_level: 50, max_stock_level: 500,
    opening_price: 12.5, location: 'A-03-001', is_consumable: true, expiry_alert_days: 30,
    sap_material_number: 'SAP-NAIL-5', gl_account: '1210-003',
  },
  {
    item_code: 'DEMO-WMS-004', name_ar: 'جهاز قياس حرارة رقمي', name_en: 'Digital Thermometer',
    description: 'جهاز قياس حرارة رقمي للأغراض المعملية', category_code: 'DEMO-SAFE', subcategory_code: 'SUB-SAFE-1',
    unit_code: 'PC', warehouse_code: 'DEMO-WH-1', min_stock_level: 5, max_stock_level: 60,
    opening_price: 45, location: 'A-04-001', is_consumable: false, expiry_alert_days: 30,
    sap_material_number: 'SAP-THM-DG', gl_account: '1210-004',
  },
  {
    item_code: 'DEMO-WMS-005', name_ar: 'شريط لاصق للتغليف', name_en: 'Packing Tape',
    description: 'شريط لاصق شفاف للتغليف', category_code: 'DEMO-PKG', subcategory_code: 'SUB-PKG-1',
    unit_code: 'ROLL', warehouse_code: 'DEMO-WH-1', min_stock_level: 20, max_stock_level: 250,
    opening_price: 8, location: 'A-05-001', is_consumable: true, expiry_alert_days: 30,
    sap_material_number: 'SAP-TAPE-50', gl_account: '1210-005',
  },
];

const UNIT_CONVERSIONS = [
  { item_code: 'DEMO-WMS-001', from_unit_code: 'ROLL', to_unit_code: 'M', factor: 100 },
  { item_code: 'DEMO-WMS-002', from_unit_code: 'BOX', to_unit_code: 'KG', factor: 18 },
  { item_code: 'DEMO-WMS-003', from_unit_code: 'BOX', to_unit_code: 'KG', factor: 10 },
  { item_code: 'DEMO-WMS-004', from_unit_code: 'PC', to_unit_code: 'BOX', factor: 12 },
  { item_code: 'DEMO-WMS-005', from_unit_code: 'ROLL', to_unit_code: 'M', factor: 50 },
];

const PROJECTS = [
  { name: 'مشروع تطوير المختبر المركزي', department_code: 'DEMO-LAB', supervisor_username: 'dept_manager', notes: 'DEMO-WMS مشروع تطوير المختبر المركزي' },
  { name: 'مشروع خط الإنتاج الجديد', department_code: 'DEMO-PROD', supervisor_username: 'storekeeper', notes: 'DEMO-WMS مشروع خط الإنتاج الجديد' },
  { name: 'مشروع صيانة المخازن', department_code: 'DEMO-MAINT', supervisor_username: 'wh_manager', notes: 'DEMO-WMS مشروع صيانة المخازن' },
  { name: 'مشروع أنظمة الجودة', department_code: 'DEMO-QC', supervisor_username: 'accountant', notes: 'DEMO-WMS مشروع أنظمة الجودة' },
  { name: 'مشروع البنية التحتية للشبكات', department_code: 'DEMO-ENG', supervisor_username: 'dept_manager', notes: 'DEMO-WMS مشروع البنية التحتية للشبكات' },
];

const REQUESTS = [
  {
    department_code: 'DEMO-ENG', warehouse_code: 'DEMO-WH-1', requester_username: 'dept_manager',
    request_type: 'project', project_index: 4, priority: 'high', needed_by: '2026-08-15',
    notes: 'DEMO-WMS طلب مشروع البنية التحتية للشبكات',
    items: [
      { item_code: 'DEMO-WMS-001', quantity: 30, unit_code: 'ROLL' },
      { item_code: 'DEMO-WMS-003', quantity: 50, unit_code: 'KG' },
      { item_code: 'DEMO-WMS-004', quantity: 5, unit_code: 'PC' },
    ],
    action: 'issue',
  },
  {
    department_code: 'DEMO-LAB', warehouse_code: 'DEMO-WH-1', requester_username: 'accountant',
    request_type: 'experiment', project_index: -1, priority: 'normal', needed_by: '2026-08-20',
    notes: 'DEMO-WMS طلب تجارب المعمل الكيميائي',
    items: [
      { item_code: 'DEMO-WMS-002', quantity: 10, unit_code: 'BOX' },
      { item_code: 'DEMO-WMS-005', quantity: 20, unit_code: 'ROLL' },
    ],
    action: 'approve',
  },
  {
    department_code: 'DEMO-MAINT', warehouse_code: 'DEMO-WH-1', requester_username: 'wh_manager',
    request_type: 'project', project_index: 2, priority: 'high', needed_by: '2026-08-12',
    notes: 'DEMO-WMS طلب مشروع صيانة المخازن',
    items: [
      { item_code: 'DEMO-WMS-004', quantity: 3, unit_code: 'PC' },
      { item_code: 'DEMO-WMS-005', quantity: 10, unit_code: 'ROLL' },
    ],
    action: 'pending',
  },
  {
    department_code: 'DEMO-QC', warehouse_code: 'DEMO-WH-1', requester_username: 'storekeeper',
    request_type: 'semester', project_index: -1, priority: 'normal', needed_by: '2026-08-25',
    notes: 'DEMO-WMS طلب احتياجات فصل إدارة الجودة',
    items: [
      { item_code: 'DEMO-WMS-003', quantity: 20, unit_code: 'KG' },
    ],
    action: 'approve',
  },
  {
    department_code: 'DEMO-PROD', warehouse_code: 'DEMO-WH-1', requester_username: 'dept_manager',
    request_type: 'project', project_index: 1, priority: 'normal', needed_by: '2026-08-18',
    notes: 'DEMO-WMS طلب مشروع خط الإنتاج الجديد',
    items: [
      { item_code: 'DEMO-WMS-002', quantity: 25, unit_code: 'BOX' },
      { item_code: 'DEMO-WMS-005', quantity: 30, unit_code: 'ROLL' },
    ],
    action: 'pending',
  },
];

const SETTINGS = [
  { key: 'inventory_account', value: 'Inventory' },
  { key: 'supplier_account', value: 'Suppliers' },
  { key: 'expense_account_prefix', value: 'Expense_' },
  { key: 'valuation_method', value: 'FIFO' },
];

const REPORT_TABLES = [
  'units', 'departments', 'categories', 'subcategories', 'warehouses', 'locations',
  'suppliers', 'items', 'item_warehouse_stock', 'unit_conversions', 'projects',
  'transactions', 'transaction_details', 'stock_movements', 'batches', 'journal_entries',
  'material_requests', 'material_request_details', 'custodies', 'inventory_sessions',
  'inventory_counts', 'alerts', 'system_settings',
];

interface DemoIds {
  items: number[];
  warehouses: number[];
  departments: number[];
  categories: string[];
  suppliers: number[];
  projects: number[];
  requests: number[];
  sessions: number[];
  transactions: number[];
}

async function collectDemoIds(): Promise<DemoIds> {
  const [items, warehouses, departments, categories, suppliers, projects, requests, sessions] = await Promise.all([
    pool.query("SELECT id FROM items WHERE item_code LIKE 'DEMO-WMS%'"),
    pool.query("SELECT id FROM warehouses WHERE code LIKE 'DEMO-WH%'"),
    pool.query("SELECT id FROM departments WHERE code LIKE 'DEMO-%'"),
    pool.query("SELECT code FROM categories WHERE code LIKE 'DEMO-%'"),
    pool.query('SELECT id FROM suppliers WHERE name_en = ANY($1)', [SUPPLIERS.map(s => s.name_en)]),
    pool.query("SELECT id FROM projects WHERE notes LIKE 'DEMO-WMS%'"),
    pool.query("SELECT id FROM material_requests WHERE notes LIKE 'DEMO-WMS%'"),
    pool.query("SELECT id FROM inventory_sessions WHERE notes LIKE 'DEMO-WMS%'"),
  ]);

  const wh = warehouses.rows.map((r: any) => r.id as number);
  const dept = departments.rows.map((r: any) => r.id as number);
  const sup = suppliers.rows.map((r: any) => r.id as number);

  let transactions: number[] = [];
  if (wh.length + dept.length + sup.length > 0) {
    const txRes = await pool.query(
      `SELECT id FROM transactions
       WHERE warehouse_id = ANY($1) OR to_warehouse_id = ANY($1) OR department_id = ANY($2) OR supplier_id = ANY($3)`,
      [wh.length ? wh : [-1], dept.length ? dept : [-1], sup.length ? sup : [-1]]
    );
    transactions = txRes.rows.map((r: any) => r.id as number);
  }

  return {
    items: items.rows.map((r: any) => r.id as number),
    warehouses: wh,
    departments: dept,
    categories: categories.rows.map((r: any) => r.code as string),
    suppliers: sup,
    projects: projects.rows.map((r: any) => r.id as number),
    requests: requests.rows.map((r: any) => r.id as number),
    sessions: sessions.rows.map((r: any) => r.id as number),
    transactions,
  };
}

async function cleanupDemo(ids: DemoIds): Promise<void> {
  const del = async (sql: string, values: unknown[]): Promise<number> => {
    const res = await pool.query(sql, values);
    return res.rowCount ?? 0;
  };

  await pool.query('BEGIN');
  try {
    let total = 0;
    total += await del('DELETE FROM journal_entries WHERE transaction_id = ANY($1)', [ids.transactions]);
    total += await del('DELETE FROM transaction_details WHERE transaction_id = ANY($1)', [ids.transactions]);
    total += await del('DELETE FROM stock_movements WHERE transaction_id = ANY($1)', [ids.transactions]);
    total += await del('DELETE FROM batches WHERE item_id = ANY($1) OR warehouse_id = ANY($2) OR supplier_id = ANY($3)', [ids.items, ids.warehouses, ids.suppliers]);
    total += await del('DELETE FROM item_warehouse_stock WHERE item_id = ANY($1)', [ids.items]);
    total += await del('DELETE FROM alerts WHERE item_id = ANY($1)', [ids.items]);
    total += await del('DELETE FROM inventory_counts WHERE session_id = ANY($1)', [ids.sessions]);
    total += await del('DELETE FROM inventory_sessions WHERE id = ANY($1)', [ids.sessions]);
    total += await del('DELETE FROM custodies WHERE item_id = ANY($1)', [ids.items]);
    total += await del('DELETE FROM material_request_details WHERE request_id = ANY($1)', [ids.requests]);
    total += await del('DELETE FROM material_requests WHERE id = ANY($1)', [ids.requests]);
    total += await del('DELETE FROM projects WHERE id = ANY($1)', [ids.projects]);
    total += await del('DELETE FROM transactions WHERE id = ANY($1)', [ids.transactions]);
    total += await del('DELETE FROM locations WHERE warehouse_id = ANY($1)', [ids.warehouses]);
    total += await del('DELETE FROM unit_conversions WHERE item_id = ANY($1)', [ids.items]);
    total += await del('DELETE FROM items WHERE id = ANY($1)', [ids.items]);
    total += await del('DELETE FROM subcategories WHERE category_code = ANY($1)', [ids.categories]);
    total += await del('DELETE FROM categories WHERE code = ANY($1)', [ids.categories]);
    total += await del('DELETE FROM warehouses WHERE id = ANY($1)', [ids.warehouses]);
    total += await del('DELETE FROM departments WHERE id = ANY($1)', [ids.departments]);
    total += await del('DELETE FROM suppliers WHERE id = ANY($1)', [ids.suppliers]);
    await pool.query('COMMIT');
    console.log(`  cleaned up ${total} existing demo rows`);
  } catch (err: any) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

async function ensureUnit(u: { code: string; name_ar: string; name_en: string }) {
  const existing = await unitsRepository.findByCode(u.code);
  if (existing) return existing;
  return unitsRepository.create(u);
}

async function ensureDepartment(d: { code: string; name_ar: string; name_en: string }) {
  const existing = await departmentsRepository.findByCode(d.code);
  if (existing) return existing;
  return departmentsRepository.create(d);
}

async function ensureCategory(c: any) {
  const existing = await categoriesRepository.findByCode(c.code);
  if (existing) return existing;
  return categoriesRepository.create(c);
}

async function ensureSubcategory(s: any) {
  const existing = await subcategoriesRepository.findByCode(s.category_code, s.code);
  if (existing) return existing;
  return subcategoriesRepository.create(s);
}

async function ensureWarehouse(w: any) {
  const existing = await pool.query('SELECT * FROM warehouses WHERE code = $1', [w.code]);
  if (existing.rows.length > 0) return existing.rows[0];
  return warehousesRepository.create(w);
}

async function ensureSupplier(s: any) {
  const existing = await pool.query('SELECT * FROM suppliers WHERE name_en = $1', [s.name_en]);
  if (existing.rows.length > 0) return existing.rows[0];
  return suppliersRepository.create(s);
}

async function ensureLocation(l: any, warehouseId: number) {
  const existing = await pool.query('SELECT id FROM locations WHERE barcode = $1', [l.barcode]);
  if (existing.rows.length > 0) return existing.rows[0];
  const res = await pool.query(
    'INSERT INTO locations (warehouse_id, rack, shelf, bin, barcode) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [warehouseId, l.rack, l.shelf, l.bin, l.barcode]
  );
  return res.rows[0];
}

async function createApprovedTransaction(header: any, details: any[], approvedBy: number): Promise<any> {
  let result: any = null;
  await runInTransaction(async (client: any) => {
    const draft = await transactionsService.createDraft(header, details, client);
    await transactionsService.approveTransaction(draft.id, approvedBy, client);
    result = draft;
  });
  return result;
}

async function seed(): Promise<void> {
  const dbRes = await pool.query('SELECT current_database() AS db');
  const dbName = String(dbRes.rows[0].db).toLowerCase();
  if (dbName !== DEV_DB) {
    console.error(`Refusing to run: connected database is "${dbName}", expected "${DEV_DB}".`);
    process.exitCode = 1;
    return;
  }

  const usersRes = await pool.query(
    'SELECT id, username, full_name, role, is_active FROM users ORDER BY id'
  );
  const userMap: Record<string, any> = {};
  for (const u of usersRes.rows) {
    userMap[u.username] = u;
  }
  const ADMIN = userMap['admin'];
  if (!ADMIN) {
    console.error('Aborting: no "admin" user found. Seed data is not needed without users.');
    process.exitCode = 1;
    return;
  }

  const mode = EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)';
  console.log(`Connected to database: ${dbRes.rows[0].db}`);
  console.log(`Mode: ${mode}`);
  console.log(`Users available: ${usersRes.rows.map((u: any) => `${u.username}(${u.role})`).join(', ')}`);
  console.log('');

  const demoIds = await collectDemoIds();
  const existingDemoItems = demoIds.items.length;
  console.log(`Existing demo rows: items=${existingDemoItems}, warehouses=${demoIds.warehouses.length}, ` +
    `transactions=${demoIds.transactions.length}, requests=${demoIds.requests.length}, projects=${demoIds.projects.length}`);
  console.log('');

  if (!EXECUTE) {
    console.log('Planned inserts:');
    console.log(`  5 x units, departments, categories, subcategories, warehouses, locations, suppliers, items`);
    console.log(`  5 x unit_conversions, projects, material_requests, transactions, custodies, inventory_sessions`);
    console.log(`  4 x system_settings`);
    console.log(`  Derived rows: transaction_details=11, stock_movements=12, batches=6, journal_entries=5, inventory_counts=5`);
    console.log(`  users=6 untouched; alerts expected 0`);
    console.log('');
    console.log('DRY RUN complete. Re-run with --execute to perform the seed.');
    return;
  }

  console.log('Seeding...');
  if (existingDemoItems > 0) {
    await cleanupDemo(demoIds);
    console.log('');
  }

  const unitIds: Record<string, any> = {};
  for (const u of UNITS) {
    unitIds[u.code] = await ensureUnit(u);
  }
  console.log(`  units: ${UNITS.length}`);

  const deptIds: Record<string, any> = {};
  for (const d of DEPARTMENTS) {
    deptIds[d.code] = await ensureDepartment(d);
  }
  console.log(`  departments: ${DEPARTMENTS.length}`);

  const catIds: Record<string, any> = {};
  for (const c of CATEGORIES) {
    catIds[c.code] = await ensureCategory(c);
  }
  console.log(`  categories: ${CATEGORIES.length}`);

  const subIds: Record<string, any> = {};
  for (const s of SUBCATEGORIES) {
    subIds[s.code] = await ensureSubcategory(s);
  }
  console.log(`  subcategories: ${SUBCATEGORIES.length}`);

  const whIds: Record<string, any> = {};
  for (const w of WAREHOUSES) {
    whIds[w.code] = await ensureWarehouse(w);
  }
  console.log(`  warehouses: ${WAREHOUSES.length}`);

  const locIds: Record<string, any> = {};
  for (const l of LOCATIONS) {
    locIds[l.barcode] = await ensureLocation(l, whIds[l.warehouse_code].id);
  }
  console.log(`  locations: ${LOCATIONS.length}`);

  const supplierIds: Record<string, any> = {};
  for (const s of SUPPLIERS) {
    supplierIds[s.name_en] = await ensureSupplier(s);
  }
  console.log(`  suppliers: ${SUPPLIERS.length}`);

  for (const s of SETTINGS) {
    await pool.query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [s.key, s.value]);
  }
  console.log(`  system_settings: ${SETTINGS.length}`);

  const itemIds: Record<string, any> = {};
  for (const it of ITEMS) {
    const row = await (itemsService.createItem as any)({
      item_code: it.item_code,
      name_ar: it.name_ar,
      name_en: it.name_en,
      description: it.description,
      category_code: it.category_code,
      subcategory_id: subIds[it.subcategory_code].id,
      unit_code: it.unit_code,
      warehouse_id: whIds[it.warehouse_code].id,
      min_stock_level: it.min_stock_level,
      max_stock_level: it.max_stock_level,
      current_balance: 0,
      opening_price: it.opening_price,
      location: it.location,
      is_consumable: it.is_consumable,
      expiry_alert_days: it.expiry_alert_days,
      sap_material_number: it.sap_material_number,
      gl_account: it.gl_account,
    });
    itemIds[it.item_code] = row;
  }
  console.log(`  items: ${ITEMS.length}`);

  for (const uc of UNIT_CONVERSIONS) {
    await unitConversionsRepository.create({
      item_id: itemIds[uc.item_code].id,
      from_unit_code: uc.from_unit_code,
      to_unit_code: uc.to_unit_code,
      factor: uc.factor,
    });
  }
  console.log(`  unit_conversions: ${UNIT_CONVERSIONS.length}`);

  const projectIds: number[] = [];
  for (const p of PROJECTS) {
    const proj = await projectsService.create(ADMIN.id, {
      name: p.name,
      department_id: deptIds[p.department_code].id,
      supervisor_id: userMap[p.supervisor_username].id,
      notes: p.notes,
    });
    projectIds.push(proj.id);
  }
  console.log(`  projects: ${PROJECTS.length}`);

  const wh1 = whIds['DEMO-WH-1'].id;
  const wh2 = whIds['DEMO-WH-2'].id;
  const cable = itemIds['DEMO-WMS-001'].id;
  const paint = itemIds['DEMO-WMS-002'].id;
  const nails = itemIds['DEMO-WMS-003'].id;
  const thermo = itemIds['DEMO-WMS-004'].id;
  const tape = itemIds['DEMO-WMS-005'].id;

  const rv = await createApprovedTransaction(
    {
      type: 'RV',
      warehouse_id: wh1,
      supplier_id: supplierIds['Al-Noor Trading Company'].id,
      created_by: ADMIN.id,
      notes: 'DEMO-WMS استلام بضاعة من المورد',
    },
    [
      { item_id: cable, quantity: 100, unit_code: 'ROLL', unit_price: 150 },
      { item_id: paint, quantity: 50, unit_code: 'BOX', unit_price: 85, expiry_tracking_enabled: true, production_date: '2026-01-15', expiry_date: '2027-08-01' },
      { item_id: nails, quantity: 200, unit_code: 'KG', unit_price: 12.5 },
      { item_id: thermo, quantity: 20, unit_code: 'PC', unit_price: 45 },
      { item_id: tape, quantity: 100, unit_code: 'ROLL', unit_price: 8 },
    ],
    ADMIN.id
  );
  console.log(`  transaction RV ${rv.transaction_no}`);

  const batchRes = await pool.query('SELECT item_id, batch_number FROM batches WHERE transaction_id = $1', [rv.id]);
  const batchByItem: Record<number, string> = {};
  for (const b of batchRes.rows) {
    batchByItem[b.item_id] = b.batch_number;
  }

  const requestIds: number[] = [];
  const requestNos: string[] = [];
  for (const r of REQUESTS) {
    const req = await materialRequestsService.createRequest(userMap[r.requester_username].id, {
      department_id: deptIds[r.department_code].id,
      warehouse_id: whIds[r.warehouse_code].id,
      request_type: r.request_type,
      project_id: r.project_index >= 0 ? projectIds[r.project_index] : null,
      priority: r.priority,
      needed_by: r.needed_by,
      notes: r.notes,
      items: r.items.map((it: any) => ({
        item_id: itemIds[it.item_code].id,
        quantity: it.quantity,
        unit_code: it.unit_code,
      })),
    });
    requestIds.push(req.id);
    requestNos.push(req.request_no);
  }
  console.log(`  material_requests: ${requestIds.length} (${requestNos.join(', ')})`);

  for (let i = 0; i < REQUESTS.length; i++) {
    if (REQUESTS[i].action === 'approve') {
      await materialRequestsService.approveRequest(requestIds[i], ADMIN.id);
    }
  }

  const req1 = requestIds[0];
  await materialRequestsService.approveRequest(req1, ADMIN.id);
  const issued = await materialRequestsService.issueRequest(req1, userMap['storekeeper'].id);
  const lnTxnId = issued.transaction_id as number;
  console.log(`  material_request issued -> LN transaction id=${lnTxnId}`);

  await runInTransaction(async (client: any) => {
    const deductions: Array<[number, number]> = [[cable, 30], [nails, 50], [thermo, 5]];
    for (const [itemId, qty] of deductions) {
      const res = await batchesRepository.deductQuantity(client, itemId, wh1, batchByItem[itemId], qty);
      if (!res) {
        throw new Error(`Batch deduction failed for item ${itemId} (qty ${qty})`);
      }
    }
  });
  console.log('  batch deductions applied for issued LN');

  const trf = await createApprovedTransaction(
    {
      type: 'TRF',
      warehouse_id: wh1,
      to_warehouse_id: wh2,
      created_by: ADMIN.id,
      notes: 'DEMO-WMS تحويل طلاء للمخزن الثاني',
    },
    [
      { item_id: paint, quantity: 15, unit_code: 'BOX', unit_price: 0, batch_number: batchByItem[paint] },
    ],
    ADMIN.id
  );
  console.log(`  transaction TRF ${trf.transaction_no}`);

  const adj = await createApprovedTransaction(
    {
      type: 'ADJ',
      warehouse_id: wh1,
      created_by: ADMIN.id,
      notes: 'DEMO-WMS جرد جزئي - إضافة رصيد أشرطة',
    },
    [
      { item_id: tape, quantity: 10, unit_code: 'ROLL', unit_price: 0, batch_number: batchByItem[tape] },
    ],
    ADMIN.id
  );
  console.log(`  transaction ADJ ${adj.transaction_no}`);

  const rti = await createApprovedTransaction(
    {
      type: 'RTI',
      warehouse_id: wh1,
      created_by: ADMIN.id,
      notes: 'DEMO-WMS إعادة أجهزة قياس من عهدة',
    },
    [
      { item_id: thermo, quantity: 3, unit_code: 'PC', unit_price: 45, batch_number: batchByItem[thermo] },
    ],
    ADMIN.id
  );
  console.log(`  transaction RTI ${rti.transaction_no}`);

  const custodyDefs = [
    { assigned_username: 'wh_manager', quantity: 3, notes: 'DEMO-WMS عهدة أجهزة قياس - مشرف المخازن' },
    { assigned_username: 'storekeeper', quantity: 1, notes: 'DEMO-WMS عهدة جهاز قياس - أمين المخزن' },
    { assigned_username: 'accountant', quantity: 1, notes: 'DEMO-WMS عهدة جهاز قياس - المحاسب' },
    { assigned_username: 'viewer', quantity: 1, notes: 'DEMO-WMS عهدة جهاز قياس - مراجع' },
  ];

  const custodyIds: number[] = [];
  await runInTransaction(async (client: any) => {
    for (const c of custodyDefs) {
      const row = await custodiesRepository.create(client, {
        item_id: thermo,
        warehouse_id: wh1,
        assigned_to: userMap[c.assigned_username].id,
        quantity: c.quantity,
        unit_code: 'PC',
        issued_transaction_id: lnTxnId,
        request_id: req1,
        project_id: projectIds[4],
        notes: c.notes,
      });
      custodyIds.push(row.id);
    }
  });
  console.log(`  custodies: ${custodyIds.length} (plus 1 auto-created on issue)`);

  await runInTransaction(async (client: any) => {
    const returned = await custodiesRepository.markReturned(client, custodyIds[0], rti.id, 'DEMO-WMS إرجاع عهدة بعد الانتهاء');
    if (!returned) {
      throw new Error('Custody return failed');
    }
  });
  console.log('  custody #1 marked returned via RTI');

  for (const wh of WAREHOUSES) {
    await inventoryService.openSession(whIds[wh.code].id, ADMIN.id, 'DEMO-WMS جرد دوري للمخزن');
  }
  console.log(`  inventory_sessions: ${WAREHOUSES.length}`);

  console.log('');
  console.log('Verifying counts...');
  const tableRows: Array<{ table: string; count: number }> = [];
  for (const table of REPORT_TABLES) {
    const res = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
    tableRows.push({ table, count: res.rows[0].total });
  }
  const usersAfter = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  tableRows.push({ table: 'users', count: usersAfter.rows[0].total });

  console.log('┌───────────────────────────────┬─────────┐');
  console.log('│ table                         │   count │');
  console.log('├───────────────────────────────┼─────────┤');
  for (const r of tableRows) {
    console.log(`│ ${r.table.padEnd(29)} │ ${String(r.count).padStart(7)} │`);
  }
  console.log('└───────────────────────────────┴─────────┘');
  console.log('');
  console.log(`Seed completed successfully. Marker namespace: ${MARKER}`);
  console.log('Re-run is safe: previous demo rows are deleted first, users are untouched.');
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err: any) => {
    console.error('');
    console.error('ERROR — seed failed:');
    console.error(`  ${err.message}`);
    await pool.end();
    process.exitCode = 1;
  });
