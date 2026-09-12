import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ============================================================================
// repair-demo-data.ts
//
// Repairs the DEMO data inside the LIVE DTC_WMS database so it is internally
// consistent with the WMS business rules (scope / material-request workflow):
//
//   * All DEMO-* warehouses become active (main + receiving per department).
//   * warehouse.manager1 is assigned only to Engineering warehouses (#12, #17)
//     and linked to department DEMO-ENG; warehouse.manager2 only to QC
//     warehouses (#19, #14) and linked to DEMO-QC.
//   * department.manager4 (DEMO-QC) and department.manager5 (DEMO-MAINT) are
//     created so every demo department has its own manager; the password of
//     department.manager3 is aligned to the shared demo password.
//   * Demo projects point to their department's active warehouse, get their
//     own department manager as supervisor, an academic year and a student
//     roster.
//   * Demo material-request actors are fixed to match the workflow:
//     warehouse manager creates for their own warehouse, department manager
//     approves/forwards their own department's requests, admin approves.
//   * The cross-department demo custody is reassigned to the department.
//   * items.current_balance is re-synced to the primary warehouse balance.
//   * New DEMO-* stock is added to the active main warehouse of QC, MAINT,
//     PROD and LAB via approved RV transactions (keeps stock_movements,
//     batches and item_warehouse_stock consistent).
//
// SAFETY:
//   * Only touches DEMO-* records (DEMO-*/CHM-* items, DEMO-* warehouses,
//     PRJ-2026-00xxx projects, REQ-2026-00xxx requests, known demo users).
//   * Idempotent: re-running after a failure completes the repair.
//   * Dry-run by default; requires --execute to apply.
//   * Never deactivates anything, never touches non-demo records.
//
// Usage:
//   ts-node scripts/repair-demo-data.ts            # dry run
//   ts-node scripts/repair-demo-data.ts --execute  # apply
// ============================================================================

const EXECUTE = process.argv.includes('--execute');
const DEV_DB = 'dtc_wms';
const DEMO_PASSWORD = 'Admin@123';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pool, runInTransaction } = require('../src/config/database');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { itemsService } = require('../src/modules/items/items.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transactionsService } = require('../src/modules/transactions/transactions.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require('bcryptjs');

interface ItemStockDef {
  item_code: string;
  name_ar: string;
  name_en: string;
  description: string;
  category_code: string;
  subcategory_code: string;
  unit_code: string;
  min_stock_level: number;
  max_stock_level: number;
  opening_price: number;
  location: string;
  is_consumable: boolean;
  expiry_alert_days: number;
  sap_material_number: string;
  gl_account: string;
  qty: number;
  unit_price: number;
  expiry_tracking_enabled?: boolean;
  production_date?: string;
  expiry_date?: string;
}

interface WarehouseStockDef {
  warehouse_code: string;
  supplier_name_en: string;
  items: ItemStockDef[];
}

const NEW_SUBCATEGORIES = [
  { category_code: 'DEMO-CHEM', code: 'SUB-CHEM-2', name_ar: 'زيوت وشحوم ومذيبات', name_en: 'Lubricants & Solvents', description: 'زيوت التشحيم والشحوم والمذيبات' },
  { category_code: 'DEMO-HARD', code: 'SUB-HARD-2', name_ar: 'أدوات يدوية', name_en: 'Hand Tools', description: 'العدد والأدوات اليدوية' },
  { category_code: 'DEMO-HARD', code: 'SUB-HARD-3', name_ar: 'قطع غيار', name_en: 'Spare Parts', description: 'قطع غيار الآلات والمعدات' },
  { category_code: 'DEMO-PKG', code: 'SUB-PKG-2', name_ar: 'عبوات التغليف', name_en: 'Packaging Containers', description: 'الكراتين وعبوات التغليف' },
];

const INVENTORY: WarehouseStockDef[] = [
  {
    warehouse_code: 'DEMO-MAIN-QC',
    supplier_name_en: 'Modern Safety Company',
    items: [
      {
        item_code: 'DEMO-QC-001', name_ar: 'طقم أوزان معايرة', name_en: 'Calibration Weight Set',
        description: 'أوزان معايرة مصنفة للتحقق من أجهزة القياس', category_code: 'DEMO-SAFE',
        subcategory_code: 'SUB-SAFE-1', unit_code: 'PC', min_stock_level: 1, max_stock_level: 20,
        opening_price: 220, location: 'C-01-001', is_consumable: false, expiry_alert_days: 365,
        sap_material_number: 'SAP-QC-WT', gl_account: '1210-101', qty: 10, unit_price: 220,
      },
      {
        item_code: 'DEMO-QC-002', name_ar: 'قدمة قياس رقمية', name_en: 'Digital Caliper',
        description: 'قدمة قياس رقمية دقيقة لفحص الجودة', category_code: 'DEMO-SAFE',
        subcategory_code: 'SUB-SAFE-1', unit_code: 'PC', min_stock_level: 2, max_stock_level: 25,
        opening_price: 95, location: 'C-02-001', is_consumable: false, expiry_alert_days: 365,
        sap_material_number: 'SAP-QC-CAL', gl_account: '1210-102', qty: 6, unit_price: 95,
      },
    ],
  },
  {
    warehouse_code: 'DEMO-MAIN-MAINT',
    supplier_name_en: 'Gulf Industrial Group',
    items: [
      {
        item_code: 'DEMO-MAINT-001', name_ar: 'زيت تزييت 5 لتر', name_en: 'Lubricating Oil 5L',
        description: 'زيت تزييت صناعي للماكينات - عبوة 5 لتر', category_code: 'DEMO-CHEM',
        subcategory_code: 'SUB-CHEM-2', unit_code: 'BOX', min_stock_level: 5, max_stock_level: 60,
        opening_price: 55, location: 'D-01-001', is_consumable: true, expiry_alert_days: 180,
        sap_material_number: 'SAP-MNT-OIL', gl_account: '1210-201', qty: 40, unit_price: 55,
        expiry_tracking_enabled: true, production_date: '2026-01-10', expiry_date: '2026-07-10',
      },
      {
        item_code: 'DEMO-MAINT-002', name_ar: 'طقم أدوات صيانة', name_en: 'Maintenance Tool Set',
        description: 'طقم أدوات صيانة كامل للمخازن', category_code: 'DEMO-HARD',
        subcategory_code: 'SUB-HARD-2', unit_code: 'PC', min_stock_level: 2, max_stock_level: 30,
        opening_price: 130, location: 'D-02-001', is_consumable: false, expiry_alert_days: 365,
        sap_material_number: 'SAP-MNT-TLS', gl_account: '1210-202', qty: 12, unit_price: 130,
      },
    ],
  },
  {
    warehouse_code: 'DEMO-MAIN-PROD',
    supplier_name_en: 'Gulf Industrial Group',
    items: [
      {
        item_code: 'DEMO-PROD-001', name_ar: 'كرتون تغليف', name_en: 'Packaging Cartons',
        description: 'كراتين تغليف مقاومة للمنتجات النهائية', category_code: 'DEMO-PKG',
        subcategory_code: 'SUB-PKG-2', unit_code: 'PC', min_stock_level: 100, max_stock_level: 1000,
        opening_price: 3.5, location: 'E-01-001', is_consumable: true, expiry_alert_days: 30,
        sap_material_number: 'SAP-PRD-CRT', gl_account: '1210-301', qty: 500, unit_price: 3.5,
      },
      {
        item_code: 'DEMO-PROD-002', name_ar: 'سير نقل الحركة', name_en: 'Drive Belt',
        description: 'سير نقل حركة لخطوط الإنتاج', category_code: 'DEMO-HARD',
        subcategory_code: 'SUB-HARD-3', unit_code: 'PC', min_stock_level: 10, max_stock_level: 100,
        opening_price: 65, location: 'E-02-001', is_consumable: true, expiry_alert_days: 90,
        sap_material_number: 'SAP-PRD-BLT', gl_account: '1210-302', qty: 25, unit_price: 65,
      },
    ],
  },
  {
    warehouse_code: 'DEMO-MAIN-LAB',
    supplier_name_en: 'Al-Ofoq Trading Establishment',
    items: [
      {
        item_code: 'DEMO-LAB-002', name_ar: 'ماء مقطر 5 لتر', name_en: 'Distilled Water 5L',
        description: 'ماء مقطر للتجارب المعملية - عبوة 5 لتر', category_code: 'DEMO-CHEM',
        subcategory_code: 'SUB-CHEM-2', unit_code: 'BOX', min_stock_level: 5, max_stock_level: 80,
        opening_price: 28, location: 'B-01-001', is_consumable: true, expiry_alert_days: 180,
        sap_material_number: 'SAP-LAB-H2O', gl_account: '1210-401', qty: 20, unit_price: 28,
        expiry_tracking_enabled: true, production_date: '2026-02-01', expiry_date: '2026-08-01',
      },
    ],
  },
];

const PROJECT_UPDATES = [
  { project_no: 'PRJ-2026-00011', warehouse_code: 'DEMO-WH-2', supervisor: 'department.manager2' },
  { project_no: 'PRJ-2026-00012', warehouse_code: 'DEMO-WH-5', supervisor: 'department.manager3' },
  { project_no: 'PRJ-2026-00013', warehouse_code: 'DEMO-WH-4', supervisor: 'department.manager5' },
  { project_no: 'PRJ-2026-00014', warehouse_code: 'DEMO-WH-3', supervisor: 'department.manager4' },
  { project_no: 'PRJ-2026-00015', warehouse_code: 'DEMO-WH-6', supervisor: 'department.manager1' },
];

const PROJECT_STUDENTS: Record<string, Array<{ full_name: string; student_id: string; role: string }>> = {
  'PRJ-2026-00011': [
    { full_name: 'أحمد سمير', student_id: '2023-LAB-001', role: 'Leader' },
    { full_name: 'سارة محمود', student_id: '2023-LAB-002', role: 'Member' },
    { full_name: 'محمد خالد', student_id: '2023-LAB-003', role: 'Member' },
  ],
  'PRJ-2026-00012': [
    { full_name: 'حسام علي', student_id: '2023-PRD-001', role: 'Leader' },
    { full_name: 'نور الدين عبدالله', student_id: '2023-PRD-002', role: 'Member' },
    { full_name: 'ريم حسن', student_id: '2023-PRD-003', role: 'Member' },
  ],
  'PRJ-2026-00013': [
    { full_name: 'مصطفى حسن', student_id: '2023-MNT-001', role: 'Leader' },
    { full_name: 'عمر فاروق', student_id: '2023-MNT-002', role: 'Member' },
    { full_name: 'ليلى إبراهيم', student_id: '2023-MNT-003', role: 'Member' },
  ],
  'PRJ-2026-00014': [
    { full_name: 'يوسف رمضان', student_id: '2023-QC-001', role: 'Leader' },
    { full_name: 'هند سامي', student_id: '2023-QC-002', role: 'Member' },
  ],
  'PRJ-2026-00015': [
    { full_name: 'كريم عادل', student_id: '2023-ENG-001', role: 'Leader' },
    { full_name: 'أمل حسن', student_id: '2023-ENG-002', role: 'Member' },
    { full_name: 'طارق نبيل', student_id: '2023-ENG-003', role: 'Member' },
  ],
};

const REQUEST_FIXES: Array<{ request_no: string; requested_by?: string; dept_approved_by?: string; forwarded_by?: string }> = [
  { request_no: 'REQ-2026-00017', requested_by: 'warehouse.manager1', dept_approved_by: 'department.manager1', forwarded_by: 'department.manager1' },
  { request_no: 'REQ-2026-00018', requested_by: 'admin', dept_approved_by: 'department.manager2', forwarded_by: 'department.manager2' },
  { request_no: 'REQ-2026-00019', requested_by: 'admin' },
  { request_no: 'REQ-2026-00020', requested_by: 'warehouse.manager2', dept_approved_by: 'department.manager4', forwarded_by: 'department.manager4' },
  { request_no: 'REQ-2026-00021', requested_by: 'admin' },
];

const WAREHOUSE_MANAGER_ASSIGNMENTS: Array<{ username: string; department_code: string; warehouse_codes: string[] }> = [
  { username: 'warehouse.manager1', department_code: 'DEMO-ENG', warehouse_codes: ['DEMO-WH-1', 'DEMO-WH-6'] },
  { username: 'warehouse.manager2', department_code: 'DEMO-QC', warehouse_codes: ['DEMO-MAIN-QC', 'DEMO-WH-3'] },
];

const NEW_USERS: Array<{ username: string; full_name: string; department_code: string }> = [
  { username: 'department.manager4', full_name: 'منى أحمد', department_code: 'DEMO-QC' },
  { username: 'department.manager5', full_name: 'خالد سالم', department_code: 'DEMO-MAINT' },
];

const ACADEMIC_YEAR = '2025-2026';

type Row = Record<string, any>;

async function createApprovedTransaction(header: any, details: any[], approvedBy: number): Promise<any> {
  let result: any = null;
  await runInTransaction(async (client: any) => {
    const draft = await transactionsService.createDraft(header, details, client);
    await transactionsService.approveTransaction(draft.id, approvedBy, client);
    result = draft;
  });
  return result;
}

async function main() {
  const client = await pool.connect();
  try {
    const dbRes = await client.query('SELECT current_database() AS db');
    const dbName = String(dbRes.rows[0].db).toLowerCase();
    if (dbName !== DEV_DB) {
      console.error(`Refusing to run: connected database is "${dbRes.rows[0].db}", expected "${DEV_DB}".`);
      process.exitCode = 1;
      return;
    }

    console.log(`Connected to database: ${dbRes.rows[0].db}`);
    console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)'}`);
    console.log('');

    // ---- Resolve reference ids ----------------------------------------------------
    const dept: Record<string, Row> = {};
    {
      const res = await client.query(`SELECT id, code FROM departments WHERE code LIKE 'DEMO-%'`);
      for (const r of res.rows) dept[r.code] = r;
    }
    const wh: Record<string, Row> = {};
    {
      const res = await client.query(`SELECT id, code, department_id, is_main, is_active FROM warehouses WHERE code LIKE 'DEMO-%'`);
      for (const r of res.rows) wh[r.code] = r;
    }
    const user: Record<string, Row> = {};
    {
      const res = await client.query(
        `SELECT id, username, role, department_id, is_active FROM users WHERE username = ANY($1)`,
        [[
          'admin',
          'warehouse.manager1', 'warehouse.manager2',
          'department.manager1', 'department.manager2', 'department.manager3',
        ]]
      );
      for (const r of res.rows) user[r.username] = r;
    }
    const subcat: Record<string, Row> = {};
    {
      const res = await client.query(`SELECT id, category_code, code FROM subcategories WHERE is_active = true`);
      for (const r of res.rows) subcat[`${r.category_code}/${r.code}`] = r;
    }

    if (!user['admin']) {
      console.error('Aborting: no "admin" user found.');
      process.exitCode = 1;
      return;
    }
    for (const key of ['DEMO-ENG', 'DEMO-LAB', 'DEMO-QC', 'DEMO-MAINT', 'DEMO-PROD']) {
      if (!dept[key]) {
        console.error(`Aborting: department ${key} not found.`);
        process.exitCode = 1;
        return;
      }
    }

    console.log('Current demo topology:');
    for (const [code, d] of Object.entries(dept)) {
      const wlist = await client.query(
        `SELECT w.code, w.is_main, w.is_active FROM warehouses w WHERE w.department_id = $1 ORDER BY w.id`,
        [d.id]
      );
      const parts = wlist.rows.map((w: Row) => `${w.code}${w.is_main ? '[M]' : ''}${w.is_active ? '' : '[inactive]'}`);
      console.log(`  ${code}: ${parts.join(', ')}`);
    }
    console.log('');

    const beforeAssignments: string[] = [];
    for (const a of WAREHOUSE_MANAGER_ASSIGNMENTS) {
      const u = user[a.username];
      if (!u) continue;
      const whs = await client.query(
        `SELECT w.code FROM user_warehouses uw JOIN warehouses w ON w.id = uw.warehouse_id WHERE uw.user_id = $1 ORDER BY w.id`,
        [u.id]
      );
      beforeAssignments.push(`  ${a.username}: dept=${u.department_id ?? 'NULL'} wh=[${whs.rows.map((r: Row) => r.code).join(', ')}]`);
    }
    console.log('Warehouse manager assignments:');
    for (const line of beforeAssignments) console.log(line);
    console.log('');

    if (!EXECUTE) {
      console.log('Plan:');
      console.log('  1. Activate all DEMO-* warehouses (main + receiving per department).');
      console.log('  2. Reassign warehouse.manager1 -> {DEMO-WH-1, DEMO-WH-6} (DEMO-ENG),');
      console.log('     warehouse.manager2 -> {DEMO-MAIN-QC, DEMO-WH-3} (DEMO-QC); link each manager to its department.');
      console.log('  3. Create department.manager4 (DEMO-QC) and department.manager5 (DEMO-MAINT);');
      console.log('     align department.manager3 password to the shared demo password.');
      console.log('  4. Projects: set active same-department warehouse + department supervisor + academic year.');
      console.log('  5. Add student rosters to demo projects (only if empty).');
      console.log('  6. Fix material-request actors to match the workflow.');
      console.log('  7. Reassign the cross-department demo custody to the department manager.');
      console.log('  8. Sync items.current_balance to the primary warehouse balance.');
      console.log(`  9. Add ${INVENTORY.reduce((n, w) => n + w.items.length, 0)} DEMO-* items + approved RV stock in QC/MAINT/PROD/LAB main warehouses.`);
      console.log('');
      console.log('DRY RUN complete. Re-run with --execute to apply.');
      return;
    }

    // ---- Phase A: pure SQL repairs (single transaction) -----------------------------
    await runInTransaction(async (tx: any) => {
      // 1. Activate all demo warehouses
      const actRes = await tx.query(
        `UPDATE warehouses SET is_active = true WHERE code LIKE 'DEMO-%' AND is_active = false RETURNING code`
      );
      console.log(`Activated ${actRes.rowCount} warehouse(s): ${actRes.rows.map((r: Row) => r.code).join(', ')}`);

      // 2. Warehouse manager assignments + department link
      for (const a of WAREHOUSE_MANAGER_ASSIGNMENTS) {
        const u = user[a.username];
        if (!u) {
          console.warn(`  user ${a.username} not found, skipping assignment`);
          continue;
        }
        await tx.query('DELETE FROM user_warehouses WHERE user_id = $1', [u.id]);
        for (const code of a.warehouse_codes) {
          const w = wh[code];
          if (!w) {
            console.warn(`  warehouse ${code} not found, skipping assignment for ${a.username}`);
            continue;
          }
          await tx.query(
            'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [u.id, w.id]
          );
        }
        await tx.query('UPDATE users SET department_id = $1 WHERE id = $2', [dept[a.department_code].id, u.id]);
        console.log(`  assigned ${a.username} -> [${a.warehouse_codes.join(', ')}] (dept ${a.department_code})`);
      }

      // 3. New department managers + password alignment
      for (const nu of NEW_USERS) {
        const existing = await tx.query('SELECT id, password_hash FROM users WHERE username = $1', [nu.username]);
        if (existing.rows.length > 0) {
          const matches = await bcrypt.compare(DEMO_PASSWORD, existing.rows[0].password_hash);
          if (!matches) {
            const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
            await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, existing.rows[0].id]);
            console.log(`  ${nu.username}: existed, password aligned to demo password`);
          } else {
            console.log(`  ${nu.username}: already exists (password OK)`);
          }
          continue;
        }
        const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const res = await tx.query(
          `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active, token_version)
           VALUES ($1, $2, $3, 'department_manager', $4, true, 0) RETURNING id`,
          [nu.username, hash, nu.full_name, dept[nu.department_code].id]
        );
        console.log(`  created ${nu.username} (#${res.rows[0].id}) -> ${nu.department_code}`);
      }
      if (user['department.manager3']) {
        const u3 = (await tx.query('SELECT password_hash FROM users WHERE id = $1', [user['department.manager3'].id])).rows[0];
        if (u3 && !(await bcrypt.compare(DEMO_PASSWORD, u3.password_hash))) {
          const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
          await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user['department.manager3'].id]);
          console.log('  department.manager3: password aligned to demo password');
        }
      }

      // Refresh the reference map so the managers just created are resolvable below.
      const freshManagers = await tx.query(
        `SELECT id, username, role, department_id FROM users
          WHERE username IN ('department.manager4', 'department.manager5')`
      );
      for (const r of freshManagers.rows) user[r.username] = r;

      // 4. Projects: warehouse + supervisor + academic year
      for (const p of PROJECT_UPDATES) {
        const res = await tx.query(
          `SELECT id, warehouse_id, supervisor_id, academic_year FROM projects WHERE project_no = $1`,
          [p.project_no]
        );
        const proj = res.rows[0];
        if (!proj) {
          console.warn(`  project ${p.project_no} not found, skipping`);
          continue;
        }
        const targetWh = wh[p.warehouse_code]?.id ?? null;
        const targetSup = user[p.supervisor]?.id ?? null;
        const sets: string[] = [];
        const params: any[] = [];
        const applied: string[] = [];
        if (targetWh && proj.warehouse_id !== targetWh) {
          sets.push(`warehouse_id = $${params.length + 1}`);
          params.push(targetWh);
          applied.push(`warehouse=${p.warehouse_code}`);
        }
        if (targetSup && proj.supervisor_id !== targetSup) {
          sets.push(`supervisor_id = $${params.length + 1}`);
          params.push(targetSup);
          applied.push(`supervisor=${p.supervisor}`);
        }
        if ((proj.academic_year ?? null) !== ACADEMIC_YEAR) {
          sets.push(`academic_year = $${params.length + 1}`);
          params.push(ACADEMIC_YEAR);
          applied.push(`year=${ACADEMIC_YEAR}`);
        }
        if (sets.length > 0) {
          params.push(proj.id);
          await tx.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
          console.log(`  project ${p.project_no}: fixed (${applied.join(', ')})`);
        } else {
          console.log(`  project ${p.project_no}: already consistent`);
        }
      }

      // 5. Student rosters (only if the roster is empty)
      for (const p of PROJECT_UPDATES) {
        const res = await tx.query(`SELECT id FROM projects WHERE project_no = $1`, [p.project_no]);
        const proj = res.rows[0];
        if (!proj) continue;
        const cnt = await tx.query(`SELECT COUNT(*)::int AS c FROM project_students WHERE project_id = $1`, [proj.id]);
        if (cnt.rows[0].c > 0) {
          console.log(`  students ${p.project_no}: already has ${cnt.rows[0].c}, skipping`);
          continue;
        }
        const students = PROJECT_STUDENTS[p.project_no] ?? [];
        for (const s of students) {
          await tx.query(
            `INSERT INTO project_students (project_id, full_name, student_id, role) VALUES ($1, $2, $3, $4)`,
            [proj.id, s.full_name, s.student_id, s.role]
          );
        }
        console.log(`  students ${p.project_no}: added ${students.length} student(s)`);
      }

      // 6. Material request actors
      for (const f of REQUEST_FIXES) {
        const res = await tx.query(
          `SELECT id, requested_by, dept_approved_by, forwarded_by FROM material_requests WHERE request_no = $1`,
          [f.request_no]
        );
        const req = res.rows[0];
        if (!req) {
          console.warn(`  request ${f.request_no} not found, skipping`);
          continue;
        }
        const fields: Array<{ col: string; target?: string }> = [
          { col: 'requested_by', target: f.requested_by },
          { col: 'dept_approved_by', target: f.dept_approved_by },
          { col: 'forwarded_by', target: f.forwarded_by },
        ];
        const sets: string[] = [];
        const params: any[] = [];
        for (const fld of fields) {
          if (!fld.target) continue;
          const targetId = user[fld.target]?.id;
          if (targetId && req[fld.col] !== targetId) {
            sets.push(`${fld.col} = $${params.length + 1}`);
            params.push(targetId);
          }
        }
        if (sets.length > 0) {
          params.push(req.id);
          await tx.query(`UPDATE material_requests SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
          console.log(`  request ${f.request_no}: actors fixed (${sets.map((s) => s.split(' ')[0]).join(', ')})`);
        } else {
          console.log(`  request ${f.request_no}: actors already consistent`);
        }
      }

      // 7. Cross-department custody reassignment
      const custodyRes = await tx.query(
        `UPDATE custodies SET assigned_to = $1
          WHERE request_id = (SELECT id FROM material_requests WHERE request_no = 'REQ-2026-00017')
            AND warehouse_id = (SELECT id FROM warehouses WHERE code = 'DEMO-WH-6')
            AND assigned_to = $2
         RETURNING id`,
        [user['department.manager1'].id, user['department.manager2'].id]
      );
      if (custodyRes.rowCount > 0) {
        console.log(`  custody #${custodyRes.rows[0].id}: reassigned to department.manager1`);
      } else {
        console.log('  custody: no cross-department assignment to fix');
      }

      // 8. Sync items.current_balance to primary warehouse balance
      const syncRes = await tx.query(
        `UPDATE items i
            SET current_balance = iws.current_balance
           FROM item_warehouse_stock iws
          WHERE iws.item_id = i.id
            AND iws.warehouse_id = i.warehouse_id
            AND (i.item_code LIKE 'DEMO-%' OR i.item_code LIKE 'CHM-%')
            AND i.current_balance <> iws.current_balance
         RETURNING i.item_code, iws.current_balance`
      );
      if (syncRes.rowCount > 0) {
        for (const r of syncRes.rows) console.log(`  item ${r.item_code}: current_balance -> ${r.current_balance}`);
      } else {
        console.log('  items: current_balance already synced');
      }

      // 9. New subcategories
      for (const s of NEW_SUBCATEGORIES) {
        const key = `${s.category_code}/${s.code}`;
        if (subcat[key]) {
          console.log(`  subcategory ${key}: already exists`);
          continue;
        }
        const res = await tx.query(
          `INSERT INTO subcategories (category_code, code, name_ar, name_en, description, is_active)
           VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
          [s.category_code, s.code, s.name_ar, s.name_en, s.description]
        );
        subcat[key] = { id: res.rows[0].id };
        console.log(`  subcategory ${key} (#${res.rows[0].id}): created`);
      }
    });

    console.log('');

    // ---- Phase B: new inventory (items + approved RV) -------------------------------
    for (const stock of INVENTORY) {
      const whId = wh[stock.warehouse_code]?.id;
      if (!whId) {
        console.warn(`  warehouse ${stock.warehouse_code} not found, skipping stock`);
        continue;
      }
      if (!stock.supplier_name_en) {
        console.warn(`  supplier ${stock.supplier_name_en} not found, skipping stock for ${stock.warehouse_code}`);
        continue;
      }
      for (const it of stock.items) {
        // ensure item
        const existingItem = await client.query(`SELECT id FROM items WHERE item_code = $1`, [it.item_code]);
        let itemId: number;
        if (existingItem.rows.length > 0) {
          itemId = existingItem.rows[0].id;
          console.log(`  item ${it.item_code}: already exists (#${itemId})`);
        } else {
          const created = await (itemsService.createItem as any)({
            item_code: it.item_code,
            name_ar: it.name_ar,
            name_en: it.name_en,
            description: it.description,
            category_code: it.category_code,
            subcategory_id: subcat[`${it.category_code}/${it.subcategory_code}`]?.id ?? null,
            unit_code: it.unit_code,
            warehouse_id: whId,
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
          itemId = created.id;
          console.log(`  item ${it.item_code}: created (#${itemId}) in ${stock.warehouse_code}`);
        }

        // ensure approved RV
        const existingRv = await client.query(
          `SELECT t.id FROM transactions t
            JOIN transaction_details td ON td.transaction_id = t.id
           WHERE t.type = 'RV' AND t.warehouse_id = $1 AND td.item_id = $2
             AND t.notes LIKE 'DEMO-WMS%' AND t.status = 'approved'
           LIMIT 1`,
          [whId, itemId]
        );
        if (existingRv.rows.length > 0) {
          console.log(`  RV for ${it.item_code} in ${stock.warehouse_code}: already exists (txn #${existingRv.rows[0].id})`);
          continue;
        }
        const detail: any = {
          item_id: itemId,
          quantity: it.qty,
          unit_code: it.unit_code,
          unit_price: it.unit_price,
        };
        if (it.expiry_tracking_enabled) {
          detail.expiry_tracking_enabled = true;
          detail.production_date = it.production_date;
          detail.expiry_date = it.expiry_date;
        }
        const rv = await createApprovedTransaction(
          {
            type: 'RV',
            warehouse_id: whId,
            created_by: user['admin'].id,
            notes: `DEMO-WMS استلام بضاعة - ${it.name_en}`,
          },
          [detail],
          user['admin'].id
        );
        console.log(`  RV ${rv.transaction_no}: +${it.qty} ${it.unit_code} ${it.item_code} -> ${stock.warehouse_code}`);
      }
    }

    console.log('');

    // ---- Phase C: verification --------------------------------------------------------
    await validate(client);
  } catch (err: any) {
    console.error('');
    console.error('ERROR — aborting:');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function validate(client: any): Promise<void> {
  console.log('Validation:');
  const checks: Array<{ label: string; sql: string }> = [
    {
      label: 'Every demo department has exactly one active department manager',
      sql: `SELECT d.code, COUNT(u.id)::int AS cnt
              FROM departments d
              LEFT JOIN users u ON u.department_id = d.id AND u.role = 'department_manager' AND u.is_active
             WHERE d.code LIKE 'DEMO-%'
             GROUP BY d.code
             HAVING COUNT(u.id) <> 1`,
    },
    {
      label: 'No active department manager without a department',
      sql: `SELECT username FROM users WHERE role = 'department_manager' AND is_active AND department_id IS NULL`,
    },
    {
      label: 'Every active sub_warehouse_manager has at least one active assigned warehouse',
      sql: `SELECT u.username FROM users u
             WHERE u.role = 'sub_warehouse_manager' AND u.is_active
               AND NOT EXISTS (
                 SELECT 1 FROM user_warehouses uw JOIN warehouses w ON w.id = uw.warehouse_id
                  WHERE uw.user_id = u.id AND w.is_active)`,
    },
    {
      label: 'No assigned warehouse belongs to another department than its manager',
      sql: `SELECT u.username, w.code FROM users u
              JOIN user_warehouses uw ON uw.user_id = u.id
              JOIN warehouses w ON w.id = uw.warehouse_id
             WHERE u.role = 'sub_warehouse_manager' AND u.is_active AND u.department_id IS NOT NULL
               AND w.department_id IS DISTINCT FROM u.department_id`,
    },
    {
      label: 'Every demo department has exactly one active main warehouse',
      sql: `SELECT d.code, COUNT(w.id)::int AS cnt
              FROM departments d
              LEFT JOIN warehouses w ON w.department_id = d.id AND w.is_main AND w.is_active
             WHERE d.code LIKE 'DEMO-%'
             GROUP BY d.code
             HAVING COUNT(w.id) <> 1`,
    },
    {
      label: 'Every demo department has at least one active receiving warehouse',
      sql: `SELECT d.code, COUNT(w.id)::int AS cnt
              FROM departments d
              LEFT JOIN warehouses w ON w.department_id = d.id AND NOT w.is_main AND w.is_active
             WHERE d.code LIKE 'DEMO-%'
             GROUP BY d.code
             HAVING COUNT(w.id) = 0`,
    },
    {
      label: 'No demo project points to a warehouse of another department',
      sql: `SELECT p.project_no FROM projects p
              JOIN warehouses w ON w.id = p.warehouse_id
             WHERE p.notes LIKE 'DEMO-WMS%' AND w.department_id <> p.department_id`,
    },
    {
      label: 'No demo project points to an inactive warehouse',
      sql: `SELECT p.project_no FROM projects p
              JOIN warehouses w ON w.id = p.warehouse_id
             WHERE p.notes LIKE 'DEMO-WMS%' AND w.is_active = false`,
    },
    {
      label: 'No demo material request points to a warehouse of another department',
      sql: `SELECT mr.request_no FROM material_requests mr
              JOIN warehouses w ON w.id = mr.warehouse_id
             WHERE mr.request_no LIKE 'REQ-2026-%' AND w.department_id <> mr.department_id`,
    },
    {
      label: 'Demo item balances match their primary warehouse stock',
      sql: `SELECT i.item_code FROM items i
              JOIN item_warehouse_stock iws ON iws.item_id = i.id AND iws.warehouse_id = i.warehouse_id
             WHERE (i.item_code LIKE 'DEMO-%' OR i.item_code LIKE 'CHM-%')
               AND i.current_balance <> iws.current_balance`,
    },
  ];

  let failures = 0;
  for (const c of checks) {
    const res = await client.query(c.sql);
    if (res.rowCount === 0) {
      console.log(`  [PASS] ${c.label}`);
    } else {
      failures += 1;
      console.log(`  [FAIL] ${c.label}`);
      for (const r of res.rows) console.log(`         ${JSON.stringify(r)}`);
    }
  }

  console.log('');
  if (failures === 0) {
    console.log('All validation checks passed.');
  } else {
    console.error(`${failures} validation check(s) failed.`);
    process.exitCode = 1;
  }
}

main();
