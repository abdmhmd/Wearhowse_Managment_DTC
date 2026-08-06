/**
 * seed-demo.ts
 * ------------------------------------------------------------------
 * Seeds realistic demo data for the WMS application (raw `pg`, no Prisma).
 *
 * Features:
 *  - Fully idempotent: re-running converges to the same state.
 *  - Never deletes or touches the existing users table rows (admin & friends
 *    are upserted only by username).
 *  - Single DB transaction; any failure rolls everything back.
 *  - Reproduces the inventory lifecycle (RV receipt -> LN issue -> TRF
 *    transfer -> custody) so every page/report has real data to show.
 *  - Validates the invariant "sum(batch.quantity per item+warehouse)
 *    == item_warehouse_stock.current_balance" before committing.
 *
 * Run:      npm run seed:demo:full
 *          (or) npx ts-node scripts/seed-demo.ts
 * Creds:    admin / Admin@123   (existing admin, untouched)
 *           wh_manager / Admin@123, storekeeper / Admin@123, ...
 * ------------------------------------------------------------------
 */

import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DEMO_PASSWORD = 'Admin@123';
const SALT_ROUNDS = 10;
const SEED_MARKER = '[SEED:demo]';
const SEED_MARKER_LIKE = '[SEED:demo]%';

// ─── Helpers ────────────────────────────────────────────────────────────
const log = (msg: string) => console.log(msg);
const q = (c: PoolClient, sql: string, params: unknown[] = []) => c.query(sql, params);

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Reference data definitions ─────────────────────────────────────────
const DEPARTMENTS = [
  { code: 'ENG', name_ar: 'الهندسة', name_en: 'Engineering' },
  { code: 'PROC', name_ar: 'المشتريات', name_en: 'Procurement' },
  { code: 'PROD', name_ar: 'الإنتاج', name_en: 'Production' },
];

const WAREHOUSES = [
  { code: 'WH-A', name_ar: 'المستودع الرئيسي (A)', name_en: 'Main Warehouse (A)', location: 'Building 1 - Ground Floor' },
  { code: 'WH-B', name_ar: 'المواد الخام (B)', name_en: 'Raw Materials (B)', location: 'Building 2 - Dock 3' },
  { code: 'WH-C', name_ar: 'المنتجات التامة (C)', name_en: 'Finished Goods (C)', location: 'Building 1 - First Floor' },
];

const UNITS = [
  { code: 'PCS', name_ar: 'قطعة', name_en: 'Pcs' },
  { code: 'KG', name_ar: 'كيلوغرام', name_en: 'Kg' },
  { code: 'MTR', name_ar: 'متر', name_en: 'Meter' },
  { code: 'LTR', name_ar: 'لتر', name_en: 'Liter' },
  { code: 'BOX', name_ar: 'صندوق', name_en: 'Box' },
];

const SUPPLIERS = [
  { name_ar: 'شركة ABC للصناعات', name_en: 'ABC Industries', phone: '+966501234501', email: 'sales@abc-industries.com', address: 'Riyadh, KSA' },
  { name_ar: 'شركة الإمداد العالمية', name_en: 'Global Supply Co.', phone: '+966501234502', email: 'orders@globalsupply.com', address: 'Jeddah, KSA' },
  { name_ar: 'شركة المواد المحلية', name_en: 'Local Materials Ltd.', phone: '+966501234503', email: 'info@localmaterials.com', address: 'Dammam, KSA' },
];

// Hierarchical categories: parent -> children
const CATEGORIES = [
  { code: 'RAW', name_ar: 'مواد خام', name_en: 'Raw Materials', prefix: 'RAW', parent_code: null },
  { code: 'FG', name_ar: 'منتجات تامة', name_en: 'Finished Goods', prefix: 'FG', parent_code: null },
  { code: 'MET', name_ar: 'معادن', name_en: 'Metals', prefix: 'MET', parent_code: 'RAW' },
  { code: 'PLS', name_ar: 'بلاستيك', name_en: 'Plastics', prefix: 'PLS', parent_code: 'RAW' },
  { code: 'ELE', name_ar: 'إلكترونيات', name_en: 'Electronics', prefix: 'ELE', parent_code: 'FG' },
  { code: 'PKG', name_ar: 'تغليف', name_en: 'Packaging', prefix: 'PKG', parent_code: 'FG' },
];

const DEMO_USERS = [
  { username: 'wh_manager', full_name: 'Warehouse Manager', role: 'warehouse_manager', department: 'PROC' },
  { username: 'storekeeper', full_name: 'Storekeeper', role: 'storekeeper', department: 'PROD' },
  { username: 'accountant', full_name: 'Accountant', role: 'accountant', department: 'PROC' },
  { username: 'dept_manager', full_name: 'Department Manager', role: 'department_manager', department: 'ENG' },
  { username: 'viewer', full_name: 'Viewer', role: 'viewer', department: 'ENG' },
];

// ─── Items ──────────────────────────────────────────────────────────────
interface ItemDef {
  item_code: string;
  name_ar: string;
  name_en: string;
  description: string;
  category_code: string;
  unit_code: string;
  warehouse: string; // primary warehouse
  min: number;
  max: number;
  location: string;
  consumable: boolean;
  expiry_alert_days: number;
  price: number;
  sap?: string;
  gl?: string;
}

const ITEMS: ItemDef[] = [
  { item_code: 'STEEL-BOLT-M8', name_ar: 'برغي فولاذي M8', name_en: 'Steel Bolt M8', description: 'Stainless steel hex bolt M8 x 30mm, grade 8.8', category_code: 'MET', unit_code: 'PCS', warehouse: 'WH-A', min: 200, max: 5000, location: 'A-01-01', consumable: true, expiry_alert_days: 30, price: 2.5, sap: '40000001', gl: 'Expense_RawMaterial' },
  { item_code: 'STAINLESS-SCREW-M4', name_ar: 'برغي ستانلس M4', name_en: 'Stainless Steel Screw M4', description: 'Stainless steel pan-head screw M4 x 16mm', category_code: 'MET', unit_code: 'PCS', warehouse: 'WH-A', min: 500, max: 10000, location: 'A-01-02', consumable: true, expiry_alert_days: 30, price: 0.15, sap: '40000002', gl: 'Expense_RawMaterial' },
  { item_code: 'ALUMINUM-SHEET-2MM', name_ar: 'صفيحة ألمنيوم 2مم', name_en: 'Aluminum Sheet 2mm', description: 'Aluminum sheet 2mm, 1000x2000mm, alloy 6061', category_code: 'MET', unit_code: 'KG', warehouse: 'WH-B', min: 300, max: 3000, location: 'B-02-01', consumable: true, expiry_alert_days: 90, price: 18, sap: '40000003', gl: 'Expense_RawMaterial' },
  { item_code: 'PVC-GRANULES', name_ar: 'حبيبات PVC', name_en: 'PVC Granules', description: 'PVC resin granules, grade k-65, 25kg bags', category_code: 'PLS', unit_code: 'KG', warehouse: 'WH-B', min: 200, max: 4000, location: 'B-02-02', consumable: true, expiry_alert_days: 90, price: 4.2, sap: '40000004', gl: 'Expense_RawMaterial' },
  { item_code: 'PE-FILM-ROLL', name_ar: 'لفافة غشاء بولي إيثيلين', name_en: 'PE Film Roll', description: 'Polyethylene film roll 0.08mm x 1500mm', category_code: 'PLS', unit_code: 'MTR', warehouse: 'WH-B', min: 100, max: 2000, location: 'B-02-03', consumable: true, expiry_alert_days: 60, price: 3.1, sap: '40000005', gl: 'Expense_RawMaterial' },
  { item_code: 'RESISTOR-10K', name_ar: 'مقاومة 10كيلو أوم', name_en: 'Resistor 10k', description: 'Carbon film resistor 10k ohm, 1/4W, 5%', category_code: 'ELE', unit_code: 'PCS', warehouse: 'WH-A', min: 1000, max: 20000, location: 'A-03-01', consumable: true, expiry_alert_days: 30, price: 0.05, sap: '50000001', gl: 'Expense_Electronics' },
  { item_code: 'LED-BULB-12V', name_ar: 'مصباح LED 12فولت', name_en: 'LED Bulb 12V', description: 'LED bulb 12V DC, 5W, E27 base', category_code: 'ELE', unit_code: 'PCS', warehouse: 'WH-A', min: 200, max: 3000, location: 'A-03-02', consumable: true, expiry_alert_days: 45, price: 7.5, sap: '50000002', gl: 'Expense_Electronics' },
  { item_code: 'CIRCUIT-BREAKER-16A', name_ar: 'قاطع كهربائي 16 أمبير', name_en: 'Circuit Breaker 16A', description: 'Miniature circuit breaker 16A, C-curve, 1P', category_code: 'ELE', unit_code: 'PCS', warehouse: 'WH-A', min: 200, max: 1500, location: 'A-03-03', consumable: true, expiry_alert_days: 30, price: 5.8, sap: '50000003', gl: 'Expense_Electronics' },
  { item_code: 'ARDUINO-UNO', name_ar: 'لوحة أردوينو أونو', name_en: 'Arduino Uno Rev3', description: 'Arduino Uno Rev3 microcontroller board', category_code: 'ELE', unit_code: 'PCS', warehouse: 'WH-A', min: 20, max: 200, location: 'A-03-04', consumable: false, expiry_alert_days: 30, price: 22, sap: '50000004', gl: 'Inventory' },
  { item_code: 'ASSEMBLED-PSU-12V', name_ar: 'مزود طاقة 12فولت مجمّع', name_en: 'Assembled PSU 12V 5A', description: 'Assembled switching power supply 12V 5A, cased', category_code: 'ELE', unit_code: 'PCS', warehouse: 'WH-C', min: 10, max: 100, location: 'C-01-01', consumable: false, expiry_alert_days: 30, price: 45, sap: '60000001', gl: 'Inventory' },
  { item_code: 'PACKAGING-BOX-30X20', name_ar: 'صندوق تغليف 30×20سم', name_en: 'Packaging Box 30x20cm', description: 'Corrugated packaging box 30x20x15cm, printed', category_code: 'PKG', unit_code: 'BOX', warehouse: 'WH-C', min: 200, max: 5000, location: 'C-02-01', consumable: true, expiry_alert_days: 30, price: 3.5, sap: '60000002', gl: 'Expense_Packaging' },
  { item_code: 'CORRUGATED-SHEET', name_ar: 'ورق مموج', name_en: 'Corrugated Sheet', description: 'Corrugated cardboard sheet 100x100cm, 5-ply', category_code: 'PKG', unit_code: 'PCS', warehouse: 'WH-C', min: 300, max: 3000, location: 'C-02-02', consumable: true, expiry_alert_days: 30, price: 1.2, sap: '60000003', gl: 'Expense_Packaging' },
  { item_code: 'STRETCH-WRAP-ROLL', name_ar: 'لفافة تغليف مطاطية', name_en: 'Stretch Wrap Roll', description: 'Stretch wrap film roll 500mm x 300m', category_code: 'PKG', unit_code: 'MTR', warehouse: 'WH-C', min: 100, max: 200, location: 'C-02-03', consumable: true, expiry_alert_days: 30, price: 2.75, sap: '60000004', gl: 'Expense_Packaging' },
  { item_code: 'RUBBER-GASKET-3MM', name_ar: 'حشية مطاطية 3مم', name_en: 'Rubber Gasket 3mm', description: 'Nitrile rubber gasket sheet 3mm, 1000x1000mm', category_code: 'PKG', unit_code: 'PCS', warehouse: 'WH-C', min: 100, max: 1500, location: 'C-02-04', consumable: true, expiry_alert_days: 30, price: 0.6, sap: '60000005', gl: 'Expense_Packaging' },
];

// ─── Opening stock (per item + warehouse + batch) ───────────────────────
interface OpeningBatch {
  item_code: string;
  warehouse: string;
  batch_number: string;
  production_date: string | null;
  expiry_date: string | null;
  quantity: number;
}

// "today" is fixed relative to seed run for stable expiry demos
const OPENING_BATCHES: OpeningBatch[] = [
  { item_code: 'STEEL-BOLT-M8', warehouse: 'WH-A', batch_number: 'BAT-2025-014', production_date: '2025-01-15', expiry_date: null, quantity: 200 },
  { item_code: 'STAINLESS-SCREW-M4', warehouse: 'WH-A', batch_number: 'BAT-2025-021', production_date: '2025-02-10', expiry_date: null, quantity: 1500 },
  { item_code: 'ALUMINUM-SHEET-2MM', warehouse: 'WH-B', batch_number: 'BAT-2025-030', production_date: '2025-03-01', expiry_date: null, quantity: 800 },
  { item_code: 'PVC-GRANULES', warehouse: 'WH-B', batch_number: 'BAT-2025-045', production_date: '2025-01-20', expiry_date: '2025-12-15', quantity: 1000 },
  { item_code: 'PE-FILM-ROLL', warehouse: 'WH-B', batch_number: 'BAT-2025-040', production_date: '2025-06-01', expiry_date: null, quantity: 300 },
  { item_code: 'RESISTOR-10K', warehouse: 'WH-A', batch_number: 'BAT-2025-011', production_date: '2025-01-05', expiry_date: null, quantity: 5000 },
  { item_code: 'LED-BULB-12V', warehouse: 'WH-A', batch_number: 'BAT-2026-010', production_date: '2026-01-10', expiry_date: addDays(new Date(), 20), quantity: 800 },
  { item_code: 'CIRCUIT-BREAKER-16A', warehouse: 'WH-A', batch_number: 'BAT-2025-060', production_date: '2025-05-01', expiry_date: null, quantity: 150 },
  { item_code: 'ARDUINO-UNO', warehouse: 'WH-A', batch_number: 'BAT-2026-070', production_date: '2026-02-01', expiry_date: null, quantity: 60 },
  { item_code: 'ASSEMBLED-PSU-12V', warehouse: 'WH-C', batch_number: 'BAT-2026-083', production_date: '2026-03-01', expiry_date: null, quantity: 40 },
  { item_code: 'PACKAGING-BOX-30X20', warehouse: 'WH-C', batch_number: 'BAT-2025-080', production_date: '2025-07-01', expiry_date: null, quantity: 1200 },
  { item_code: 'CORRUGATED-SHEET', warehouse: 'WH-C', batch_number: 'BAT-2025-081', production_date: '2025-08-01', expiry_date: null, quantity: 900 },
  { item_code: 'STRETCH-WRAP-ROLL', warehouse: 'WH-C', batch_number: 'BAT-2025-082', production_date: '2025-09-01', expiry_date: null, quantity: 250 },
  { item_code: 'RUBBER-GASKET-3MM', warehouse: 'WH-C', batch_number: 'BAT-2025-084', production_date: '2025-10-01', expiry_date: null, quantity: 500 },
];

// ─── Transactions (inventory lifecycle) ─────────────────────────────────
interface TxnDetail {
  item_code: string;
  quantity: number;
  unit_price: number;
  batch_number: string;
  from_warehouse?: string; // for TRF source
  to_warehouse?: string;   // for TRF destination
}

interface TxnDef {
  type: 'RV' | 'LN' | 'TRF';
  status: 'draft' | 'approved';
  supplier?: string;
  department?: string;
  warehouse: string;
  to_warehouse?: string;
  created_by: string;
  approved_by?: string;
  notes: string;
  details: TxnDetail[];
  custody?: { assigned_to: string; project_no?: string };
  days_ago: number;
}

const TXNS: TxnDef[] = [
  {
    type: 'RV', status: 'approved',
    supplier: 'ABC Industries', warehouse: 'WH-A',
    created_by: 'storekeeper', approved_by: 'wh_manager',
    notes: 'استلام مشتريات إلكترونيات وقطع من شركة ABC للصناعات',
    days_ago: 21,
    details: [
      { item_code: 'STEEL-BOLT-M8', quantity: 400, unit_price: 2.5, batch_number: 'BAT-2026-050' },
      { item_code: 'STAINLESS-SCREW-M4', quantity: 1000, unit_price: 0.15, batch_number: 'BAT-2026-051' },
      { item_code: 'RESISTOR-10K', quantity: 2000, unit_price: 0.05, batch_number: 'BAT-2026-055' },
      { item_code: 'LED-BULB-12V', quantity: 300, unit_price: 7.5, batch_number: 'BAT-2026-056' },
    ],
  },
  {
    type: 'RV', status: 'approved',
    supplier: 'Global Supply Co.', warehouse: 'WH-B',
    created_by: 'storekeeper', approved_by: 'wh_manager',
    notes: 'استلام مواد خام من شركة الإمداد العالمية',
    days_ago: 14,
    details: [
      { item_code: 'ALUMINUM-SHEET-2MM', quantity: 500, unit_price: 18, batch_number: 'BAT-2026-052' },
      { item_code: 'PVC-GRANULES', quantity: 600, unit_price: 4.2, batch_number: 'BAT-2026-053' },
      { item_code: 'PE-FILM-ROLL', quantity: 200, unit_price: 3.1, batch_number: 'BAT-2026-054' },
    ],
  },
  {
    type: 'LN', status: 'approved',
    department: 'PROD', warehouse: 'WH-A',
    created_by: 'storekeeper', approved_by: 'wh_manager',
    notes: 'صرف مواد لقسم الإنتاج - خط الإنتاج 3',
    days_ago: 7,
    details: [
      { item_code: 'STEEL-BOLT-M8', quantity: 100, unit_price: 2.5, batch_number: 'BAT-2025-014' },
      { item_code: 'STAINLESS-SCREW-M4', quantity: 300, unit_price: 0.15, batch_number: 'BAT-2025-021' },
      { item_code: 'RESISTOR-10K', quantity: 500, unit_price: 0.05, batch_number: 'BAT-2025-011' },
    ],
  },
  {
    type: 'TRF', status: 'approved',
    warehouse: 'WH-B', to_warehouse: 'WH-A',
    created_by: 'storekeeper', approved_by: 'wh_manager',
    notes: 'تحويل داخلي لألواح الألمنيوم من المواد الخام إلى الرئيسي',
    days_ago: 3,
    details: [
      { item_code: 'ALUMINUM-SHEET-2MM', quantity: 200, unit_price: 18, batch_number: 'BAT-2026-052', from_warehouse: 'WH-B', to_warehouse: 'WH-A' },
    ],
  },
  {
    type: 'LN', status: 'approved',
    department: 'ENG', warehouse: 'WH-A',
    created_by: 'storekeeper', approved_by: 'wh_manager',
    notes: 'صرف عهدة لوحة أردوينو لقسم الهندسة',
    days_ago: 2,
    details: [
      { item_code: 'ARDUINO-UNO', quantity: 10, unit_price: 22, batch_number: 'BAT-2026-070' },
    ],
    custody: { assigned_to: 'dept_manager', project_no: 'PRJ-2' },
  },
  {
    type: 'RV', status: 'draft',
    supplier: 'Local Materials Ltd.', warehouse: 'WH-C',
    created_by: 'storekeeper',
    notes: 'استلام عبوات تغليف من شركة المواد المحلية (مسودة)',
    days_ago: 1,
    details: [
      { item_code: 'PACKAGING-BOX-30X20', quantity: 500, unit_price: 3.5, batch_number: 'BAT-2026-057' },
    ],
  },
];

// ─── Projects / material requests / custody ─────────────────────────────
const PROJECTS = [
  { project_no: 'PRJ-1', name: 'Production Line 3 Upgrade', department: 'PROD', supervisor: 'wh_manager', created_by: 'admin', status: 'open', notes: 'Upgrade of production line 3 automation' },
  { project_no: 'PRJ-2', name: 'Packaging Automation Initiative', department: 'ENG', supervisor: 'dept_manager', created_by: 'admin', status: 'open', notes: 'Packaging automation pilot project' },
  { project_no: 'PRJ-3', name: 'Warehouse Racking Maintenance', department: 'PROC', supervisor: 'wh_manager', created_by: 'admin', status: 'closed', notes: 'Annual racking inspection and maintenance' },
];

const MATERIAL_REQUESTS = [
  {
    request_no: 'REQ-1', department: 'PROD', warehouse: 'WH-A', requested_by: 'storekeeper',
    status: 'pending', priority: 'high', request_type: 'project', project_no: 'PRJ-1',
    needed_in_days: 7, notes: 'طلب مواد لإنتاج خط الإنتاج 3',
    details: [
      { item_code: 'STEEL-BOLT-M8', quantity: 50, unit_code: 'PCS' },
      { item_code: 'STAINLESS-SCREW-M4', quantity: 200, unit_code: 'PCS' },
    ],
  },
  {
    request_no: 'REQ-2', department: 'ENG', warehouse: 'WH-C', requested_by: 'dept_manager',
    status: 'approved', priority: 'normal', request_type: 'project', project_no: 'PRJ-2',
    needed_in_days: 3, notes: 'طلب مواد تغليف لمشروع الأتمتة', approved_by: 'wh_manager',
    details: [
      { item_code: 'PACKAGING-BOX-30X20', quantity: 100, unit_code: 'BOX' },
      { item_code: 'STRETCH-WRAP-ROLL', quantity: 40, unit_code: 'MTR' },
    ],
  },
];

const UNIT_CONVERSIONS = [
  { item_code: 'STEEL-BOLT-M8', from: 'BOX', to: 'PCS', factor: 100 },
  { item_code: 'PVC-GRANULES', from: 'BOX', to: 'KG', factor: 25 },
];

// ─── Main seed ──────────────────────────────────────────────────────────
async function seedDemo(): Promise<void> {
  const client = await pool.connect();
  const stats: Record<string, number> = {};

  try {
    await client.query('BEGIN');

    // Disable low-stock trigger while we (re)write balances; re-enabled on COMMIT path.
    await client.query('ALTER TABLE item_warehouse_stock DISABLE TRIGGER trg_low_stock_alert');
    log('🚀 Starting demo seeding...\n');

    // ── 0. Idempotent cleanup of previously seeded rows (children first) ──
    log('🧹 Cleaning previously seeded rows...');
    const seededTxn = `SELECT id FROM transactions WHERE notes LIKE $1`;
    const seededReq = `SELECT id FROM material_requests WHERE notes LIKE $1`;
    const seededSession = `SELECT id FROM inventory_sessions WHERE notes LIKE $1`;
    const seededProjects = `SELECT id FROM projects WHERE notes LIKE $1`;

    await q(client, `DELETE FROM custodies WHERE notes LIKE $1`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM stock_movements WHERE transaction_id IN (${seededTxn})`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM inventory_counts WHERE session_id IN (${seededSession})`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM inventory_sessions WHERE notes LIKE $1`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM material_request_details WHERE request_id IN (${seededReq})`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM material_requests WHERE notes LIKE $1`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM journal_entries WHERE transaction_id IN (${seededTxn})`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM transaction_details WHERE transaction_id IN (${seededTxn})`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM batches WHERE notes LIKE $1`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM transactions WHERE notes LIKE $1`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM projects WHERE notes LIKE $1`, [SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM alerts WHERE item_id IN (SELECT id FROM items WHERE item_code = ANY($1::text[])) OR batch_id IN (SELECT id FROM batches WHERE notes LIKE $2)`, [ITEMS.map((i) => i.item_code), SEED_MARKER_LIKE]);
    await q(client, `DELETE FROM unit_conversions WHERE item_id IN (SELECT id FROM items WHERE item_code = ANY($1::text[]))`, [ITEMS.map((i) => i.item_code)]);
    await q(client, `DELETE FROM item_warehouse_stock WHERE item_id IN (SELECT id FROM items WHERE item_code = ANY($1::text[]))`, [ITEMS.map((i) => i.item_code)]);
    await q(client, `DELETE FROM items WHERE item_code = ANY($1::text[])`, [ITEMS.map((i) => i.item_code)]);
    log('  ✓ Cleanup complete');

    // ── 1. Reference data (upsert — safe to re-run) ─────────────────────
    log('\n🏢 Departments...');
    for (const d of DEPARTMENTS) {
      await q(client,
        `INSERT INTO departments (code, name_ar, name_en)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en`,
        [d.code, d.name_ar, d.name_en]);
    }
    stats['departments'] = DEPARTMENTS.length;

    log('🏭 Warehouses...');
    for (const w of WAREHOUSES) {
      await q(client,
        `INSERT INTO warehouses (code, name_ar, name_en, location)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, location = EXCLUDED.location`,
        [w.code, w.name_ar, w.name_en, w.location]);
    }
    stats['warehouses'] = WAREHOUSES.length;

    log('📐 Units...');
    for (const u of UNITS) {
      await q(client,
        `INSERT INTO units (code, name_ar, name_en)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en`,
        [u.code, u.name_ar, u.name_en]);
    }
    stats['units'] = UNITS.length;

    log('🤝 Suppliers...');
    for (const s of SUPPLIERS) {
      await q(client,
        `INSERT INTO suppliers (name_ar, name_en, phone, email, address)
         SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::text
         WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name_en = $2::varchar)`,
        [s.name_ar, s.name_en, s.phone, s.email, s.address]);
    }
    stats['suppliers'] = SUPPLIERS.length;

    log('📁 Categories (hierarchical)...');
    for (const c of CATEGORIES) {
      await q(client,
        `INSERT INTO categories (code, name_ar, name_en, prefix, parent_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, prefix = EXCLUDED.prefix, parent_code = EXCLUDED.parent_code`,
        [c.code, c.name_ar, c.name_en, c.prefix, c.parent_code]);
    }
    stats['categories'] = CATEGORIES.length;

    // ── 2. Users (upsert; existing admin left untouched) ───────────────
    log('👤 Users (upsert)...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
    const deptRows = await q(client, `SELECT id, code FROM departments`);
    const deptId: Record<string, number> = {};
    for (const r of deptRows.rows) deptId[r.code] = r.id;

    for (const u of DEMO_USERS) {
      await q(client,
        `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               full_name = EXCLUDED.full_name,
               role = EXCLUDED.role,
               department_id = EXCLUDED.department_id,
               is_active = true`,
        [u.username, passwordHash, u.full_name, u.role, deptId[u.department]]);
    }
    stats['users'] = DEMO_USERS.length;

    // ── 3. Items + opening stock + batches ──────────────────────────────
    log('📦 Items...');
    const whRows = await q(client, `SELECT id, code FROM warehouses`);
    const whId: Record<string, number> = {};
    for (const r of whRows.rows) whId[r.code] = r.id;

    for (const i of ITEMS) {
      await q(client,
        `INSERT INTO items (item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_consumable, expiry_alert_days, last_purchase_price, opening_price, sap_material_number, gl_account, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true)
         ON CONFLICT (item_code) DO UPDATE SET
           name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
           description = EXCLUDED.description, category_code = EXCLUDED.category_code,
           unit_code = EXCLUDED.unit_code, warehouse_id = EXCLUDED.warehouse_id,
           min_stock_level = EXCLUDED.min_stock_level, max_stock_level = EXCLUDED.max_stock_level,
           location = EXCLUDED.location, is_consumable = EXCLUDED.is_consumable,
           expiry_alert_days = EXCLUDED.expiry_alert_days,
           last_purchase_price = EXCLUDED.last_purchase_price,
           opening_price = EXCLUDED.opening_price,
           sap_material_number = EXCLUDED.sap_material_number, gl_account = EXCLUDED.gl_account,
           is_active = true`,
        [i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.unit_code, whId[i.warehouse], i.min, i.max, 0, i.location, i.consumable, i.expiry_alert_days, i.price, i.price, i.sap ?? null, i.gl ?? null]);
    }
    const itemRows = await q(client, `SELECT id, item_code FROM items WHERE item_code = ANY($1::text[])`, [ITEMS.map((i) => i.item_code)]);
    const itemId: Record<string, number> = {};
    for (const r of itemRows.rows) itemId[r.item_code] = r.id;
    stats['items'] = ITEMS.length;

    // Track balances per (warehouse, item) and batch quantities in memory
    const balanceKey = (whCode: string, itemCode: string) => `${whCode}|${itemCode}`;
    const batchKey = (whCode: string, itemCode: string, batch: string) => `${whCode}|${itemCode}|${batch}`;
    const balances = new Map<string, number>();
    const batchQty = new Map<string, number>();
    const batchMeta = new Map<string, { production_date: string | null; expiry_date: string | null; supplier: string | null }>();

    log('🏷️  Opening stock + batches...');
    for (const b of OPENING_BATCHES) {
      const k = balanceKey(b.warehouse, b.item_code);
      balances.set(k, (balances.get(k) || 0) + b.quantity);
      batchQty.set(batchKey(b.warehouse, b.item_code, b.batch_number), b.quantity);
      batchMeta.set(batchKey(b.warehouse, b.item_code, b.batch_number), {
        production_date: b.production_date,
        expiry_date: b.expiry_date,
        supplier: null,
      });
    }

    // ── 4. Transactions + details + movements ───────────────────────────
    log('📝 Transactions (RV/LN/TRF)...');
    const userRows = await q(client, `SELECT id, username FROM users`);
    const userId: Record<string, number> = {};
    for (const r of userRows.rows) userId[r.username] = r.id;

    const supRows = await q(client, `SELECT id, name_en FROM suppliers`);
    const supId: Record<string, number> = {};
    for (const r of supRows.rows) supId[r.name_en] = r.id;

    const adminId = userId['admin'];
    const storekeeperId = userId['storekeeper'];

    const itemUnit: Record<string, string> = {};
    for (const i of ITEMS) itemUnit[i.item_code] = i.unit_code;

    const txnNos: string[] = [];
    const movementRows: any[] = [];
    const detailRows: any[] = [];
    const journalRows: any[] = [];
    const custodyRows: any[] = [];
    let pendingRequestNo: string | null = null;

    for (const t of TXNS) {
      const seqRes = await q(client, `SELECT nextval('transaction_no_seq') AS seq`);
      const txnNo = `${t.type}-${new Date().getFullYear()}-${pad(seqRes.rows[0].seq, 6)}`;
      txnNos.push(txnNo);

      const txnDate = new Date();
      txnDate.setDate(txnDate.getDate() - t.days_ago);

      const hdr = await q(client,
        `INSERT INTO transactions (transaction_no, type, status, transaction_date, supplier_id, department_id, warehouse_id, to_warehouse_id, created_by, approved_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          txnNo, t.type, t.status, txnDate,
          t.supplier ? supId[t.supplier] ?? null : null,
          t.department ? deptId[t.department] ?? null : null,
          whId[t.warehouse],
          t.to_warehouse ? whId[t.to_warehouse] ?? null : null,
          userId[t.created_by] ?? adminId,
          t.approved_by ? userId[t.approved_by] ?? null : null,
          `${SEED_MARKER} ${t.notes}`,
        ]);
      const txnId = hdr.rows[0].id;
      stats['transactions'] = (stats['transactions'] || 0) + 1;

      // Determine detail-level stock impact per warehouse
      const impact = new Map<string, { item_code: string; wh: string; change: number; price: number }>();
      for (const d of t.details) {
        const fromWh = d.from_warehouse ?? t.warehouse;
        const toWh = d.to_warehouse ?? t.to_warehouse;
        if (t.status === 'draft') continue;

        if (t.type === 'TRF') {
          impact.set(`${fromWh}|${d.item_code}`, { item_code: d.item_code, wh: fromWh, change: -d.quantity, price: d.unit_price });
          if (toWh) impact.set(`${toWh}|${d.item_code}`, { item_code: d.item_code, wh: toWh, change: d.quantity, price: d.unit_price });
        } else {
          const isIn = t.type === 'RV';
          impact.set(`${fromWh}|${d.item_code}`, { item_code: d.item_code, wh: fromWh, change: isIn ? d.quantity : -d.quantity, price: d.unit_price });
        }
      }

      // Stock movements (only for approved)
      const userApprover = t.approved_by ? userId[t.approved_by] ?? storekeeperId : storekeeperId;
      for (const d of t.details) {
        if (t.status === 'draft') continue;
        const fromWh = d.from_warehouse ?? t.warehouse;
        const toWh = d.to_warehouse ?? t.to_warehouse;

        // Movement #1: source warehouse (OUT for LN/TRF, IN for RV)
        if (t.type === 'RV') {
          const before = balances.get(balanceKey(fromWh, d.item_code)) || 0;
          const after = before + d.quantity;
          balances.set(balanceKey(fromWh, d.item_code), after);
          movementRows.push({ item_id: itemId[d.item_code], txn_id: txnId, type: 'IN', before, change: d.quantity, after, user: userApprover });
          // new batch
          const bk = batchKey(fromWh, d.item_code, d.batch_number);
          batchQty.set(bk, d.quantity);
          batchMeta.set(bk, { production_date: addDays(new Date(), -t.days_ago), expiry_date: null, supplier: t.supplier ?? null });
        } else if (t.type === 'LN') {
          const before = balances.get(balanceKey(fromWh, d.item_code)) || 0;
          const remaining = batchQty.get(batchKey(fromWh, d.item_code, d.batch_number)) || 0;
          if (remaining < d.quantity) {
            throw new Error(`Insufficient batch ${d.batch_number} for ${d.item_code}: have ${remaining}, need ${d.quantity}`);
          }
          const after = before - d.quantity;
          balances.set(balanceKey(fromWh, d.item_code), after);
          batchQty.set(batchKey(fromWh, d.item_code, d.batch_number), remaining - d.quantity);
          movementRows.push({ item_id: itemId[d.item_code], txn_id: txnId, type: 'OUT', before, change: -d.quantity, after, user: userApprover });
        } else if (t.type === 'TRF') {
          const before = balances.get(balanceKey(fromWh, d.item_code)) || 0;
          const remaining = batchQty.get(batchKey(fromWh, d.item_code, d.batch_number)) || 0;
          if (remaining < d.quantity) {
            throw new Error(`Insufficient batch ${d.batch_number} for ${d.item_code}: have ${remaining}, need ${d.quantity}`);
          }
          const after = before - d.quantity;
          balances.set(balanceKey(fromWh, d.item_code), after);
          batchQty.set(batchKey(fromWh, d.item_code, d.batch_number), remaining - d.quantity);
          movementRows.push({ item_id: itemId[d.item_code], txn_id: txnId, type: 'OUT', before, change: -d.quantity, after, user: userApprover });

          if (toWh) {
            const dbefore = balances.get(balanceKey(toWh, d.item_code)) || 0;
            const dafter = dbefore + d.quantity;
            balances.set(balanceKey(toWh, d.item_code), dafter);
            const dk = batchKey(toWh, d.item_code, d.batch_number);
            batchQty.set(dk, d.quantity);
            const srcMeta = batchMeta.get(batchKey(fromWh, d.item_code, d.batch_number));
            batchMeta.set(dk, { production_date: srcMeta?.production_date ?? null, expiry_date: srcMeta?.expiry_date ?? null, supplier: null });
            movementRows.push({ item_id: itemId[d.item_code], txn_id: txnId, type: 'IN', before: dbefore, change: d.quantity, after: dafter, user: userApprover });
          }
        }
      }

      // Details rows
      for (const d of t.details) {
        detailRows.push({ txn_id: txnId, item_id: itemId[d.item_code], quantity: d.quantity, unit_code: itemUnit[d.item_code], unit_price: d.unit_price, batch_number: d.batch_number });
        stats['transaction_details'] = (stats['transaction_details'] || 0) + 1;
      }

      // Journal entry for approved transactions with value
      if (t.status === 'approved') {
        const total = t.details.reduce((sum, d) => sum + d.quantity * d.unit_price, 0);
        let debit: string;
        let credit: string;
        if (t.type === 'RV') { debit = 'Inventory'; credit = 'Suppliers'; }
        else if (t.type === 'TRF') { debit = 'Inventory_Transfer'; credit = 'Inventory'; }
        else { debit = `Expense_${t.department ?? 'General'}`; credit = 'Inventory'; }
        journalRows.push({ txn_id: txnId, debit, credit, amount: Math.round(total * 100) / 100, desc: `${t.type} ${txnNo}`, user: userApprover });
      }

      // Custody
      if (t.custody && t.status === 'approved') {
        const c = t.custody;
        custodyRows.push({
          item_id: itemId[t.details[0].item_code],
          wh: t.warehouse,
          assigned_to: userId[c.assigned_to],
          quantity: t.details[0].quantity,
          unit: itemUnit[t.details[0].item_code],
          txn_id: txnId,
          req_id: null,
          project_no: c.project_no,
          notes: `${SEED_MARKER} عهدة ${t.details[0].item_code}`,
        });
      }
    }

    // Insert movements + details + journal + batches
    for (const m of movementRows) {
      await q(client,
        `INSERT INTO stock_movements (item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, movement_date, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [m.item_id, m.txn_id, m.type, m.before, m.change, m.after, m.user]);
      stats['stock_movements'] = (stats['stock_movements'] || 0) + 1;
    }
    for (const d of detailRows) {
      await q(client,
        `INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, batch_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [d.txn_id, d.item_id, d.quantity, d.unit_code, d.unit_price, d.batch_number]);
    }
    for (const j of journalRows) {
      await q(client,
        `INSERT INTO journal_entries (transaction_id, entry_date, account_debit, account_credit, amount, description, created_by)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)`,
        [j.txn_id, j.debit, j.credit, j.amount, j.desc, j.user]);
    }

    // ── 5. Final balances → item_warehouse_stock + items ────────────────
    log('⚖️  Writing final stock balances...');
    for (const [k, bal] of balances) {
      const [whCode, itemCode] = k.split('|');
      await q(client,
        `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance, min_stock_level, max_stock_level)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
           current_balance = EXCLUDED.current_balance,
           min_stock_level = EXCLUDED.min_stock_level,
           max_stock_level = EXCLUDED.max_stock_level`,
        [itemId[itemCode], whId[whCode], bal, ITEMS.find((i) => i.item_code === itemCode)!.min, ITEMS.find((i) => i.item_code === itemCode)!.max]);
      stats['item_warehouse_stock'] = (stats['item_warehouse_stock'] || 0) + 1;
    }

    // Mirror primary-warehouse balance into items.current_balance (legacy)
    for (const i of ITEMS) {
      const primaryBal = balances.get(balanceKey(i.warehouse, i.item_code)) || 0;
      await q(client, `UPDATE items SET current_balance = $1 WHERE item_code = $2`, [primaryBal, i.item_code]);
    }

    // ── 6. Batches ──────────────────────────────────────────────────────
    log('🏷️  Batches...');
    for (const [k, qty] of batchQty) {
      if (qty <= 0) continue;
      const [whCode, itemCode, batchNo] = k.split('|');
      const meta = batchMeta.get(k);
      await q(client,
        `INSERT INTO batches (item_id, warehouse_id, batch_number, production_date, expiry_date, quantity, unit_code, supplier_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (item_id, warehouse_id, batch_number) DO UPDATE SET
           production_date = EXCLUDED.production_date,
           expiry_date = EXCLUDED.expiry_date,
           quantity = EXCLUDED.quantity,
           unit_code = EXCLUDED.unit_code,
           supplier_id = EXCLUDED.supplier_id`,
        [
          itemId[itemCode], whId[whCode], batchNo,
          meta?.production_date ?? null, meta?.expiry_date ?? null,
          qty, itemUnit[itemCode],
          meta?.supplier ? supId[meta.supplier] ?? null : null,
          SEED_MARKER,
        ]);
      stats['batches'] = (stats['batches'] || 0) + 1;
    }

    // ── 7. Projects ─────────────────────────────────────────────────────
    log('🗂️  Projects...');
    const projectIdMap: Record<string, number> = {};
    for (const p of PROJECTS) {
      const seqRes = await q(client, `SELECT nextval('project_no_seq') AS seq`);
      const no = `PRJ-${new Date().getFullYear()}-${pad(seqRes.rows[0].seq, 5)}`;
      const hdr = await q(client,
        `INSERT INTO projects (project_no, name, department_id, supervisor_id, status, notes, closed_by, closed_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          no, p.name, deptId[p.department], userId[p.supervisor], p.status,
          `${SEED_MARKER} ${p.notes}`,
          p.status === 'closed' ? adminId : null,
          p.status === 'closed' ? new Date() : null,
          userId[p.created_by] ?? adminId,
        ]);
      projectIdMap[p.project_no] = hdr.rows[0].id;
    }
    stats['projects'] = PROJECTS.length;

    // ── 8. Material requests ────────────────────────────────────────────
    log('📋 Material requests...');
    for (const mr of MATERIAL_REQUESTS) {
      const seqRes = await q(client, `SELECT nextval('request_no_seq') AS seq`);
      const no = `REQ-${new Date().getFullYear()}-${pad(seqRes.rows[0].seq, 5)}`;
      const needed = new Date();
      needed.setDate(needed.getDate() + mr.needed_in_days);
      const hdr = await q(client,
        `INSERT INTO material_requests (request_no, department_id, warehouse_id, requested_by, status, priority, request_type, project_id, needed_by, notes, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          no, deptId[mr.department], whId[mr.warehouse], userId[mr.requested_by],
          mr.status, mr.priority, mr.request_type,
          mr.project_no ? projectIdMap[mr.project_no] : null,
          needed,
          `${SEED_MARKER} ${mr.notes}`,
          mr.approved_by ? userId[mr.approved_by] ?? null : null,
          mr.approved_by ? new Date() : null,
        ]);
      if (mr.status === 'pending') pendingRequestNo = no;
      for (const d of mr.details) {
        await q(client,
          `INSERT INTO material_request_details (request_id, item_id, quantity, unit_code)
           VALUES ($1, $2, $3, $4)`,
          [hdr.rows[0].id, itemId[d.item_code], d.quantity, d.unit_code]);
      }
      stats['material_requests'] = (stats['material_requests'] || 0) + 1;
    }

    // ── 9. Custody ──────────────────────────────────────────────────────
    log('🔖 Custody...');
    for (const c of custodyRows) {
      await q(client,
        `INSERT INTO custodies (item_id, warehouse_id, assigned_to, quantity, unit_code, issued_transaction_id, request_id, project_id, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)`,
        [c.item_id, whId[c.wh], c.assigned_to, c.quantity, c.unit, c.txn_id, c.req_id, c.project_no ? projectIdMap[c.project_no] : null, c.notes]);
      stats['custodies'] = (stats['custodies'] || 0) + 1;
    }

    // ── 10. Inventory sessions + counts ─────────────────────────────────
    log('🔢 Inventory sessions...');
    const sessionRows: any[] = [];
    for (const [idx, s] of [
      { warehouse: 'WH-A', status: 'completed', started_by: 'wh_manager', completed_by: 'wh_manager', started_days: 30, completed_days: 10, counts: [
        { item_code: 'STEEL-BOLT-M8', counted: 500 },
        { item_code: 'STAINLESS-SCREW-M4', counted: 2200 },
        { item_code: 'RESISTOR-10K', counted: 6500 },
        { item_code: 'LED-BULB-12V', counted: 1100 },
      ]},
      { warehouse: 'WH-B', status: 'in_progress', started_by: 'wh_manager', completed_by: null, started_days: 2, completed_days: 0, counts: [
        { item_code: 'ALUMINUM-SHEET-2MM', counted: 1090 },
        { item_code: 'PVC-GRANULES', counted: null },
        { item_code: 'PE-FILM-ROLL', counted: null },
      ]},
    ].entries()) {
      const seqRes = await q(client, `SELECT nextval('inventory_session_no_seq') AS seq`);
      const no = `INV-${new Date().getFullYear()}-${pad(seqRes.rows[0].seq, 4)}`;
      const startedAt = new Date(); startedAt.setDate(startedAt.getDate() - s.started_days);
      const completedAt = new Date(); completedAt.setDate(completedAt.getDate() - s.completed_days);
      const sess = await q(client,
        `INSERT INTO inventory_sessions (session_no, warehouse_id, status, notes, started_by, started_at, completed_by, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [no, whId[s.warehouse], s.status, `${SEED_MARKER} جرد ${s.warehouse}`, userId[s.started_by], startedAt, s.completed_by ? userId[s.completed_by] : null, s.completed_by ? completedAt : null]);
      const sessionId = sess.rows[0].id;
      for (const c of s.counts) {
        const systemQty = balances.get(balanceKey(s.warehouse, c.item_code)) || 0;
        await q(client,
          `INSERT INTO inventory_counts (session_id, item_id, warehouse_id, system_qty, counted_qty, unit_code, counted_by, counted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sessionId, itemId[c.item_code], whId[s.warehouse], systemQty, c.counted, itemUnit[c.item_code], c.counted !== null ? userId[s.started_by] : null, c.counted !== null ? startedAt : null]);
      }
      sessionRows.push({ id: sessionId, no });
    }
    stats['inventory_sessions'] = sessionRows.length;

    // ── 11. Unit conversions ────────────────────────────────────────────
    log('🔄 Unit conversions...');
    for (const uc of UNIT_CONVERSIONS) {
      await q(client,
        `INSERT INTO unit_conversions (item_id, from_unit_code, to_unit_code, factor)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, from_unit_code, to_unit_code) DO UPDATE SET factor = EXCLUDED.factor`,
        [itemId[uc.item_code], uc.from, uc.to, uc.factor]);
    }
    stats['unit_conversions'] = UNIT_CONVERSIONS.length;

    // ── 12. Alerts ──────────────────────────────────────────────────────
    log('🔔 Alerts...');
    const lowStockItem = ITEMS.find((i) => i.item_code === 'CIRCUIT-BREAKER-16A')!;
    await q(client,
      `INSERT INTO alerts (type, status, item_id, warehouse_id, message_ar, message_en)
       VALUES ('low_stock', 'active', $1, $2, 'وصل المخزون إلى الحد الأدنى أو دونه', 'Stock reached minimum level or below')`,
      [itemId[lowStockItem.item_code], whId[lowStockItem.warehouse]]);

    const overstockItem = ITEMS.find((i) => i.item_code === 'STRETCH-WRAP-ROLL')!;
    await q(client,
      `INSERT INTO alerts (type, status, item_id, warehouse_id, message_ar, message_en)
       VALUES ('overstock', 'active', $1, $2, 'المخزون يتجاوز الحد الأقصى', 'Stock exceeds maximum level')`,
      [itemId[overstockItem.item_code], whId[overstockItem.warehouse]]);

    // Expiring + expired batch alerts
    for (const b of OPENING_BATCHES) {
      if (!b.expiry_date) continue;
      const bid = await q(client,
        `SELECT id FROM batches WHERE item_id = $1 AND warehouse_id = $2 AND batch_number = $3 AND notes LIKE $4`,
        [itemId[b.item_code], whId[b.warehouse], b.batch_number, SEED_MARKER_LIKE]);
      await q(client,
        `INSERT INTO alerts (type, status, item_id, warehouse_id, batch_id, message_ar, message_en)
         VALUES ('expiry_warning', 'active', $1, $2, $3, 'اقترب تاريخ انتهاء الصلاحية أو انتهى', 'Batch expiring soon or already expired')`,
        [itemId[b.item_code], whId[b.warehouse], bid.rows[0]?.id ?? null]);
    }

    // Pending request alert
    if (pendingRequestNo) {
      const pendingReq = await q(client, `SELECT id FROM material_requests WHERE request_no = $1`, [pendingRequestNo]);
      if (pendingReq.rows[0]) {
        await q(client,
          `INSERT INTO alerts (type, status, request_id, message_ar, message_en)
           VALUES ('pending_request', 'active', $1, 'يوجد طلب مواد معلق', 'Pending material request')`,
          [pendingReq.rows[0].id]);
      }
    }
    stats['alerts'] = (await q(client, `SELECT COUNT(*)::int AS c FROM alerts`)).rows[0].c;

    // ── 13. Validation ──────────────────────────────────────────────────
    log('\n✅ Validating invariants...');
    const iws = await q(client,
      `SELECT iws.item_id, iws.warehouse_id, iws.current_balance, i.item_code
       FROM item_warehouse_stock iws JOIN items i ON i.id = iws.item_id`);
    const batchTotals = await q(client,
      `SELECT b.item_id, b.warehouse_id, COALESCE(SUM(b.quantity), 0) AS total
       FROM batches b GROUP BY b.item_id, b.warehouse_id`);
    const batchTotalMap = new Map<string, number>();
    for (const r of batchTotals.rows) batchTotalMap.set(`${r.item_id}|${r.warehouse_id}`, parseFloat(r.total));

    let mismatch = 0;
    for (const r of iws.rows) {
      const total = batchTotalMap.get(`${r.item_id}|${r.warehouse_id}`) || 0;
      const cur = parseFloat(r.current_balance);
      if (Math.abs(total - cur) > 0.0001) {
        console.error(`  ✗ MISMATCH ${r.item_code} wh#${r.warehouse_id}: iws=${cur}, batchSum=${total}`);
        mismatch++;
      }
    }
    if (mismatch > 0) {
      throw new Error(`Batch/stock invariant failed for ${mismatch} rows`);
    }
    log(`  ✓ batchSum == item_warehouse_stock for all ${iws.rows.length} stock rows`);

    // Re-enable trigger and commit
    await client.query('ALTER TABLE item_warehouse_stock ENABLE TRIGGER trg_low_stock_alert');
    await client.query('COMMIT');

    // ── 14. Final summary ───────────────────────────────────────────────
    log('\n' + '═'.repeat(64));
    log('  ✅ SEEDING COMPLETE');
    log('═'.repeat(64));
    for (const [k, v] of Object.entries(stats)) {
      log(`  ${k.padEnd(22)} ${v}`);
    }

    const userCount = (await pool.query(`SELECT COUNT(*)::int AS c FROM users`)).rows[0].c;
    log(`  ${'users (total)'.padEnd(22)} ${userCount}`);
    log('');
    log('  🔐 Demo Credentials (all demo users):');
    log('  ┌──────────────┬────────────┬─────────────────────┐');
    log('  │ Username     │ Password   │ Role                │');
    log('  ├──────────────┼────────────┼─────────────────────┤');
    log('  │ admin        │ Admin@123  │ system_admin        │');
    log('  │ wh_manager   │ Admin@123  │ warehouse_manager   │');
    log('  │ storekeeper  │ Admin@123  │ storekeeper         │');
    log('  │ accountant   │ Admin@123  │ accountant          │');
    log('  │ dept_manager │ Admin@123  │ department_manager  │');
    log('  │ viewer       │ Admin@123  │ viewer              │');
    log('  └──────────────┴────────────┴─────────────────────┘');
    log('');

  } catch (err) {
    await client.query('ROLLBACK');
    try { await client.query('ALTER TABLE item_warehouse_stock ENABLE TRIGGER trg_low_stock_alert'); } catch { /* ignore */ }
    console.error('\n❌ Seed failed — transaction rolled back.');
    console.error('   ', (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}

seedDemo()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('   Stack:', (err as Error).stack?.split('\n').slice(0, 4).join('\n   '));
    await pool.end();
    process.exit(1);
  });
