import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ============================================================================
// seed-demo-items.ts
//
// Seeds realistic demo ITEMS + STOCK into the DTC_WMS (development) database
// ONLY. The target topology is the clean demo environment produced by
// scripts/reset-demo-environment.ts:
//
//   users        : admin (admin), warehouse.manager1 (ENG),
//                  warehouse.manager2 (IT)
//   departments  : DEMO-ENG (Engineering), DEMO-IT (Information Technology)
//   warehouses   : DEMO-MAIN-ENG, DEMO-MAIN-IT  (one main warehouse each)
//
// WHAT THIS SCRIPT DOES:
//   * Reuses the existing demo master data where possible (DEMO-ELEC,
//     DEMO-HARD, DEMO-SAFE, existing subcategories, existing units).
//   * Creates TWO new master categories (Computer Equipment, Office &
//     Stationery) plus their subcategories — master-data creation performed by
//     the system administrator only (matches the business rule).
//   * Creates ~20 demo items as master records (opening balance 0) via the
//     items service, exactly as an admin would.
//   * Brings stock in through the NORMAL receiving workflow: one approved
//     Receiving Voucher (RV) per warehouse, created and approved through the
//     transactions service. No direct balance edits.
//   * Marks every seeded voucher with 'DEMO-SEED' in the notes column so the
//     seeded rows are identifiable in reports/validation.
//
// NON-GOALS (hard constraints):
//   * Never touches production. Refuses to run against any database other
//     than dtc_wms.
//   * No schema / migration changes.
//   * No new users, roles, departments or warehouses.
//   * No RBAC / permission changes.
//
// IDEMPOTENCY:
//   * Every category/subcategory/item is keyed by a stable code and skipped
//     when already present.
//   * An item is considered "stocked" when item_warehouse_stock has a balance
//     > 0; only unstocked items are added to a receiving voucher. Running
//     --execute twice yields the same end state.
//
// Usage:
//   ts-node scripts/seed-demo-items.ts             # dry run (default)
//   ts-node scripts/seed-demo-items.ts --execute   # apply
//   ts-node scripts/seed-demo-items.ts --verify    # data-quality + authz checks
// ============================================================================

const EXECUTE = process.argv.includes('--execute');
const VERIFY = process.argv.includes('--verify');
const DEV_DB = 'dtc_wms';
const SEED_MARKER = 'DEMO-SEED';

const ADMIN_USERNAME = 'admin';
const WAREHOUSE_ENG = 'DEMO-MAIN-ENG';
const WAREHOUSE_IT = 'DEMO-MAIN-IT';

// ---- Master data to reuse (must already exist) ------------------------------
const REUSED_CATEGORIES = ['DEMO-ELEC', 'DEMO-HARD', 'DEMO-SAFE'];

// ---- Master data to create (admin only) -------------------------------------
const CATEGORIES_TO_CREATE = [
  { code: 'DEMO-COMP', name_ar: 'أجهزة الكمبيوتر', name_en: 'Computer Equipment', prefix: 'CMP', description: 'حواسيب وملحقاتها' },
  { code: 'DEMO-OFF', name_ar: 'القرطاسية والمكتب', name_en: 'Office & Stationery', prefix: 'OFF', description: 'مواد القرطاسية والتجهيزات المكتبية' },
];

const SUBCATEGORIES_TO_CREATE = [
  { category_code: 'DEMO-ELEC', code: 'SUB-ELEC-2', name_ar: 'الأجهزة الكهربائية', name_en: 'Electrical Devices' },
  { category_code: 'DEMO-COMP', code: 'SUB-COMP-1', name_ar: 'أجهزة الحاسوب', name_en: 'Computer Devices' },
  { category_code: 'DEMO-COMP', code: 'SUB-COMP-2', name_ar: 'ملحقات الشبكة', name_en: 'Network & Accessories' },
  { category_code: 'DEMO-SAFE', code: 'SUB-SAFE-2', name_ar: 'معدات الحماية الشخصية', name_en: 'Personal Protective Equipment' },
  { category_code: 'DEMO-OFF', code: 'SUB-OFF-1', name_ar: 'القرطاسية', name_en: 'Stationery' },
];

interface SeedItem {
  item_code: string;
  name_ar: string;
  name_en: string;
  description: string;
  category_code: string;
  subcategory_code: string | null;
  unit_code: string;
  warehouse_code: string;
  min_stock_level: number;
  max_stock_level: number;
  opening_quantity: number;
  unit_price: number;
  location: string;
  is_consumable: boolean;
}

const ITEMS: SeedItem[] = [
  // ---- Electrical (5) -> Engineering main warehouse -----------------------
  { item_code: 'ELE-1', name_ar: 'كابل كهرباء 2.5 ملم²', name_en: 'Electrical Cable 2.5mm²', description: 'سلك نحاسي أحادي العزل 2.5 ملم²', category_code: 'DEMO-ELEC', subcategory_code: 'SUB-ELEC-1', unit_code: 'M', warehouse_code: WAREHOUSE_ENG, min_stock_level: 100, max_stock_level: 2000, opening_quantity: 500, unit_price: 4.5, location: 'A1', is_consumable: true },
  { item_code: 'ELE-2', name_ar: 'كابل كهرباء 4 ملم²', name_en: 'Electrical Cable 4mm²', description: 'سلك نحاسي أحادي العزل 4 ملم²', category_code: 'DEMO-ELEC', subcategory_code: 'SUB-ELEC-1', unit_code: 'M', warehouse_code: WAREHOUSE_ENG, min_stock_level: 100, max_stock_level: 1500, opening_quantity: 300, unit_price: 7.5, location: 'A2', is_consumable: true },
  { item_code: 'ELE-3', name_ar: 'قاطع كهربائي 16 أمبير', name_en: 'Circuit Breaker 16A', description: 'قاطع كهربائي أحادي القطب 16 أمبير', category_code: 'DEMO-ELEC', subcategory_code: 'SUB-ELEC-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 20, max_stock_level: 300, opening_quantity: 60, unit_price: 18, location: 'A3', is_consumable: true },
  { item_code: 'ELE-4', name_ar: 'قاطع كهربائي 32 أمبير', name_en: 'Circuit Breaker 32A', description: 'قاطع كهربائي أحادي القطب 32 أمبير', category_code: 'DEMO-ELEC', subcategory_code: 'SUB-ELEC-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 15, max_stock_level: 200, opening_quantity: 40, unit_price: 26, location: 'A4', is_consumable: true },
  { item_code: 'ELE-5', name_ar: 'إنارة LED 20 واط', name_en: 'LED Panel Light 20W', description: 'لوح إضاءة LED 60×60 بقدرة 20 واط', category_code: 'DEMO-ELEC', subcategory_code: 'SUB-ELEC-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 20, max_stock_level: 250, opening_quantity: 50, unit_price: 45, location: 'A5', is_consumable: true },

  // ---- Computer equipment (5) -> IT main warehouse ------------------------
  { item_code: 'CMP-1', name_ar: 'لوحة مفاتيح USB', name_en: 'USB Keyboard', description: 'لوحة مفاتيح سلكية USB عربية/إنجليزية', category_code: 'DEMO-COMP', subcategory_code: 'SUB-COMP-1', unit_code: 'PC', warehouse_code: WAREHOUSE_IT, min_stock_level: 10, max_stock_level: 150, opening_quantity: 25, unit_price: 35, location: 'B1', is_consumable: false },
  { item_code: 'CMP-2', name_ar: 'فأرة USB', name_en: 'USB Mouse', description: 'فأرة سلكية ضوئية USB', category_code: 'DEMO-COMP', subcategory_code: 'SUB-COMP-1', unit_code: 'PC', warehouse_code: WAREHOUSE_IT, min_stock_level: 15, max_stock_level: 200, opening_quantity: 40, unit_price: 25, location: 'B2', is_consumable: false },
  { item_code: 'CMP-3', name_ar: 'مزود طاقة 500 واط', name_en: 'Power Supply 500W', description: 'مزود طاقة للحاسوب بقدرة 500 واط', category_code: 'DEMO-COMP', subcategory_code: 'SUB-COMP-1', unit_code: 'PC', warehouse_code: WAREHOUSE_IT, min_stock_level: 5, max_stock_level: 80, opening_quantity: 15, unit_price: 120, location: 'B3', is_consumable: false },
  { item_code: 'CMP-4', name_ar: 'كابل HDMI بطول 1.5 متر', name_en: 'HDMI Cable 1.5m', description: 'كابل HDMI عالي السرعة بطول 1.5 متر', category_code: 'DEMO-COMP', subcategory_code: 'SUB-COMP-2', unit_code: 'PC', warehouse_code: WAREHOUSE_IT, min_stock_level: 20, max_stock_level: 300, opening_quantity: 60, unit_price: 15, location: 'B4', is_consumable: false },
  { item_code: 'CMP-5', name_ar: 'كابل شبكة Cat6', name_en: 'Network Cable Cat6', description: 'كابل شبكة نحاسي Cat6 UTP', category_code: 'DEMO-COMP', subcategory_code: 'SUB-COMP-2', unit_code: 'M', warehouse_code: WAREHOUSE_IT, min_stock_level: 100, max_stock_level: 1500, opening_quantity: 400, unit_price: 3.5, location: 'B5', is_consumable: true },

  // ---- Mechanical tools (5) -> Engineering main warehouse -----------------
  { item_code: 'HRD-1', name_ar: 'طقم مفكات براغي', name_en: 'Screwdriver Set', description: 'طقم مفكات براغي 6 قطع', category_code: 'DEMO-HARD', subcategory_code: 'SUB-HARD-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 5, max_stock_level: 100, opening_quantity: 20, unit_price: 65, location: 'C1', is_consumable: false },
  { item_code: 'HRD-2', name_ar: 'مفتاح إنجليزي 10 بوصة', name_en: 'Adjustable Wrench 10"', description: 'مفتاح إنجليزي قابل للتعديل 10 بوصات', category_code: 'DEMO-HARD', subcategory_code: 'SUB-HARD-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 10, max_stock_level: 150, opening_quantity: 30, unit_price: 40, location: 'C2', is_consumable: false },
  { item_code: 'HRD-3', name_ar: 'طقم زرادية', name_en: 'Pliers Set', description: 'طقم زرادية 3 قطع', category_code: 'DEMO-HARD', subcategory_code: 'SUB-HARD-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 5, max_stock_level: 100, opening_quantity: 25, unit_price: 55, location: 'C3', is_consumable: false },
  { item_code: 'HRD-4', name_ar: 'شريط قياس 5 أمتار', name_en: 'Measuring Tape 5m', description: 'شريط قياس فولاذي بطول 5 أمتار', category_code: 'DEMO-HARD', subcategory_code: 'SUB-HARD-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 10, max_stock_level: 200, opening_quantity: 45, unit_price: 20, location: 'C4', is_consumable: false },
  { item_code: 'HRD-5', name_ar: 'طقم مثاقب معدنية', name_en: 'Drill Bit Set', description: 'طقم مثاقب معدنية 19 قطعة', category_code: 'DEMO-HARD', subcategory_code: 'SUB-HARD-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 5, max_stock_level: 100, opening_quantity: 18, unit_price: 75, location: 'C5', is_consumable: false },

  // ---- Safety equipment (3) -> Engineering main warehouse -----------------
  { item_code: 'SFE-1', name_ar: 'خوذة أمان', name_en: 'Safety Helmet', description: 'خوذة أمان بلاستيكية صلبة', category_code: 'DEMO-SAFE', subcategory_code: 'SUB-SAFE-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 20, max_stock_level: 300, opening_quantity: 70, unit_price: 30, location: 'D1', is_consumable: false },
  { item_code: 'SFE-2', name_ar: 'قفازات حماية', name_en: 'Protective Gloves', description: 'قفازات عمل مقاومة للقطع', category_code: 'DEMO-SAFE', subcategory_code: 'SUB-SAFE-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 30, max_stock_level: 400, opening_quantity: 80, unit_price: 12, location: 'D2', is_consumable: true },
  { item_code: 'SFE-3', name_ar: 'نظارات أمان', name_en: 'Safety Glasses', description: 'نظارات واقية مضادة للتكسر', category_code: 'DEMO-SAFE', subcategory_code: 'SUB-SAFE-2', unit_code: 'PC', warehouse_code: WAREHOUSE_ENG, min_stock_level: 20, max_stock_level: 300, opening_quantity: 65, unit_price: 15, location: 'D3', is_consumable: false },

  // ---- Office & stationery (2) -> IT main warehouse -----------------------
  { item_code: 'OFF-1', name_ar: 'ورق تصوير A4', name_en: 'A4 Copy Paper', description: 'ورق تصوير A4 - 500 ورقة', category_code: 'DEMO-OFF', subcategory_code: 'SUB-OFF-1', unit_code: 'BOX', warehouse_code: WAREHOUSE_IT, min_stock_level: 20, max_stock_level: 200, opening_quantity: 50, unit_price: 28, location: 'E1', is_consumable: true },
  { item_code: 'OFF-2', name_ar: 'قلم حبر دائم أسود', name_en: 'Permanent Marker Black', description: 'قلم حبر دائم أسود ذو رأس مدبب', category_code: 'DEMO-OFF', subcategory_code: 'SUB-OFF-1', unit_code: 'PC', warehouse_code: WAREHOUSE_IT, min_stock_level: 50, max_stock_level: 500, opening_quantity: 120, unit_price: 3.5, location: 'E2', is_consumable: true },
];

// One receiving voucher per warehouse; the supplier name is print metadata only.
const RECEIVING_PLAN = [
  { warehouse_code: WAREHOUSE_ENG, supplier_name: 'Gulf Industrial Group' },
  { warehouse_code: WAREHOUSE_IT, supplier_name: 'Al-Noor Trading Company' },
];

function log(msg = '') {
  console.log(msg);
}

// ---- Entry point -----------------------------------------------------------
async function main(): Promise<void> {
  const { pool } = await import('../src/config/database');
  const { loadAuthContext } = await import('../src/modules/authorization/authorization.service');
  const { categoriesService } = await import('../src/modules/categories/categories.service');
  const { categoriesRepository } = await import('../src/modules/categories/categories.repository');
  const { subcategoriesRepository } = await import('../src/modules/categories/subcategories.repository');
  const { itemsService } = await import('../src/modules/items/items.service');
  const { itemsRepository } = await import('../src/modules/items/items.repository');
  const { transactionsService } = await import('../src/modules/transactions/transactions.service');

  const dbRes = await pool.query('SELECT current_database() AS db');
  const dbName = String(dbRes.rows[0].db).toLowerCase();
  if (dbName !== DEV_DB) {
    console.error(`Refusing to run: connected database is "${dbRes.rows[0].db}", expected "${DEV_DB}" (development only).`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  if (VERIFY) {
    await runVerify(pool, loadAuthContext, itemsService);
    await pool.end();
    return;
  }

  log(`Connected to database: ${dbRes.rows[0].db} (dev)`);
  log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN (no changes)'}`);
  log('');

  const admin = await pool.query(`SELECT id, username, role FROM users WHERE username = $1 AND role = 'admin'`, [ADMIN_USERNAME]);
  if (admin.rows.length !== 1) {
    throw new Error(`SAFETY STOP: expected exactly one admin account "${ADMIN_USERNAME}".`);
  }
  const adminId = admin.rows[0].id;

  const whRes = await pool.query('SELECT id, code FROM warehouses WHERE code IN ($1, $2) AND is_active = true', [WAREHOUSE_ENG, WAREHOUSE_IT]);
  const whIds: Record<string, number> = {};
  for (const w of whRes.rows) whIds[w.code] = w.id;
  if (!whIds[WAREHOUSE_ENG] || !whIds[WAREHOUSE_IT]) {
    throw new Error(`SAFETY STOP: expected warehouses ${WAREHOUSE_ENG} and ${WAREHOUSE_IT} to exist.`);
  }

  // ---- Plan / dry-run report ----------------------------------------------
  const existingItems = new Map<string, { id: number; balance: number }>();
  const itemRows = await pool.query(
    `SELECT i.id, i.item_code,
            COALESCE((SELECT iws.current_balance FROM item_warehouse_stock iws WHERE iws.item_id = i.id AND iws.warehouse_id = i.warehouse_id), i.current_balance)::float8 AS balance
       FROM items i WHERE i.is_active = true ORDER BY i.item_code`
  );
  for (const r of itemRows.rows) existingItems.set(r.item_code, { id: r.id, balance: r.balance });

  log('Planned master-data creation:');
  const catsToCreate = [];
  for (const c of CATEGORIES_TO_CREATE) {
    const exists = await categoriesRepository.findByCode(c.code);
    if (!exists) catsToCreate.push(c.code);
  }
  log(`  categories   : ${catsToCreate.length} new (${catsToCreate.join(', ') || 'none'}) + ${REUSED_CATEGORIES.length} reused (${REUSED_CATEGORIES.join(', ')})`);

  const subsToCreate = [];
  for (const s of SUBCATEGORIES_TO_CREATE) {
    const exists = await subcategoriesRepository.findByCode(s.category_code, s.code);
    if (!exists) subsToCreate.push(`${s.category_code}/${s.code}`);
  }
  log(`  subcategories: ${subsToCreate.length} new (${subsToCreate.join(', ') || 'none'})`);

  const itemsToCreate = ITEMS.filter(i => !existingItems.has(i.item_code)).map(i => i.item_code);
  log(`  items        : ${itemsToCreate.length} new (${itemsToCreate.join(', ') || 'none'})`);

  const unstockedByWh: Record<string, SeedItem[]> = {};
  for (const item of ITEMS) {
    const existing = existingItems.get(item.item_code);
    const stocked = existing && existing.balance > 0;
    if (!stocked) (unstockedByWh[item.warehouse_code] = unstockedByWh[item.warehouse_code] || []).push(item);
  }
  log('');
  log('Planned receiving vouchers (approved RV):');
  for (const rp of RECEIVING_PLAN) {
    const items = unstockedByWh[rp.warehouse_code] || [];
    const totalValue = items.reduce((sum, i) => sum + i.opening_quantity * i.unit_price, 0);
    log(`  ${rp.warehouse_code} (supplier "${rp.supplier_name}"): ${items.length} line(s), ${items.map(i => i.item_code).join(', ') || '-'}, est. value ${totalValue.toFixed(2)}`);
  }

  const plannedItems = ITEMS.length;
  const stockedNow = ITEMS.filter(i => { const e = existingItems.get(i.item_code); return e && e.balance > 0; }).length;
  log('');
  log(`  Total demo items defined : ${plannedItems}`);
  log(`  Items already stocked    : ${stockedNow}`);

  if (!EXECUTE) {
    log('');
    log('DRY RUN complete. No changes were made.');
    log('Re-run with --execute to apply.');
    await pool.end();
    return;
  }

  // ---- Apply ---------------------------------------------------------------
  const adminCtx = await loadAuthContext(adminId);
  if (!adminCtx) throw new Error(`SAFETY STOP: could not load auth context for admin #${adminId}.`);
  log('');
  log('Executing seed...');

  let created = { categories: 0, subcategories: 0, items: 0, vouchers: 0, details: 0 };

  for (const c of CATEGORIES_TO_CREATE) {
    const exists = await categoriesRepository.findByCode(c.code);
    if (!exists) {
      await categoriesService.createCategory(c);
      created.categories += 1;
      log(`  created category ${c.code} (prefix ${c.prefix})`);
    } else {
      log(`  category ${c.code} already exists — skipped`);
    }
  }

  for (const s of SUBCATEGORIES_TO_CREATE) {
    const exists = await subcategoriesRepository.findByCode(s.category_code, s.code);
    if (!exists) {
      await categoriesService.createSubcategory(s.category_code, { code: s.code, name_ar: s.name_ar, name_en: s.name_en });
      created.subcategories += 1;
      log(`  created subcategory ${s.category_code}/${s.code}`);
    } else {
      log(`  subcategory ${s.category_code}/${s.code} already exists — skipped`);
    }
  }

  const subIds = new Map<string, number>();
  const subRows = await pool.query('SELECT id, category_code, code FROM subcategories WHERE is_active = true');
  for (const r of subRows.rows) subIds.set(`${r.category_code}/${r.code}`, r.id);

  const itemIds = new Map<string, number>();
  for (const item of ITEMS) {
    const existing = existingItems.get(item.item_code);
    if (!existing) {
      const createdItem = await itemsService.createItem(
        {
          item_code: item.item_code,
          name_ar: item.name_ar,
          name_en: item.name_en,
          description: item.description,
          category_code: item.category_code,
          subcategory_id: item.subcategory_code ? subIds.get(`${item.category_code}/${item.subcategory_code}`) ?? null : null,
          unit_code: item.unit_code,
          warehouse_id: whIds[item.warehouse_code],
          min_stock_level: item.min_stock_level,
          max_stock_level: item.max_stock_level,
          current_balance: 0,
          location: item.location,
          is_consumable: item.is_consumable,
        } as any,
        adminCtx
      );
      itemIds.set(item.item_code, createdItem.id);
      created.items += 1;
      log(`  created item ${item.item_code} (${item.name_en}) @ ${item.warehouse_code}`);
    } else {
      itemIds.set(item.item_code, existing.id);
      log(`  item ${item.item_code} already exists — skipped`);
    }
  }

  // Refresh stocking state AFTER item creation (new items have zero balance).
  const stockRows = await pool.query(
    `SELECT i.item_code,
            COALESCE((SELECT iws.current_balance FROM item_warehouse_stock iws WHERE iws.item_id = i.id AND iws.warehouse_id = i.warehouse_id), i.current_balance)::float8 AS balance
       FROM items i WHERE i.is_active = true`
  );
  const balanceByCode = new Map<string, number>();
  for (const r of stockRows.rows) balanceByCode.set(r.item_code, r.balance);

  for (const rp of RECEIVING_PLAN) {
    const whId = whIds[rp.warehouse_code];
    const lines = ITEMS.filter(i => i.warehouse_code === rp.warehouse_code && (balanceByCode.get(i.item_code) ?? 0) <= 0);
    if (lines.length === 0) {
      log(`  ${rp.warehouse_code}: no unstocked demo items — no receiving voucher needed`);
      continue;
    }

    const notes = `${SEED_MARKER} | initial receiving voucher for ${rp.warehouse_code}`;
    const existingVoucher = await pool.query(
      `SELECT t.id FROM transactions t WHERE t.type = 'RV' AND t.status = 'approved' AND t.warehouse_id = $1 AND t.notes LIKE '%' || $2 || '%' LIMIT 1`,
      [whId, SEED_MARKER]
    );
    if (existingVoucher.rows.length > 0) {
      // A seeded voucher exists but some items are unstocked — top up only the
      // missing lines through a fresh voucher (keeps balance semantics correct).
      log(`  ${rp.warehouse_code}: topping up ${lines.length} unstocked item line(s) via a new RV`);
    }

    const header = {
      type: 'RV' as const,
      warehouse_id: whId,
      notes,
      created_by: adminId,
    };
    const details = lines.map(l => ({
      item_id: itemIds.get(l.item_code)!,
      quantity: l.opening_quantity,
      unit_code: l.unit_code,
      unit_price: l.unit_price,
    }));

    const draft = await transactionsService.createDraft(header, details as any);
    const tx = await transactionsService.approveTransaction(draft.id!, adminId);
    void tx;
    created.vouchers += 1;
    created.details += lines.length;
    log(`  created + approved RV ${draft.transaction_no} (${rp.warehouse_code}, ${lines.length} line(s))`);
  }

  log('');
  log(`Seed complete: ${created.categories} categories, ${created.subcategories} subcategories, ${created.items} items, ${created.vouchers} approved receiving voucher(s) with ${created.details} line(s).`);

  await pool.end();
}

// ---- Verify mode ------------------------------------------------------------
async function runVerify(pool: any, loadAuthContext: any, itemsService: any): Promise<void> {
  log('');
  log('═══════════════════════════════════════════════════════');
  log('  VERIFY — data quality + authorization');
  log('═══════════════════════════════════════════════════════');

  let failures = 0;
  const check = (label: string, ok: boolean, detail = '') => {
    if (ok) log(`  [PASS] ${label}`);
    else {
      failures += 1;
      log(`  [FAIL] ${label} ${detail}`);
    }
  };

  // ---- 1. Item counts ------------------------------------------------------
  const itemCount = await pool.query('SELECT COUNT(*)::int AS total FROM items WHERE is_active = true');
  check(`items = 20`, itemCount.rows[0].total === 20, `(got ${itemCount.rows[0].total})`);

  // ---- 2. Demo item codes + no duplicates ----------------------------------
  const dupRes = await pool.query(
    `SELECT item_code FROM items GROUP BY item_code HAVING COUNT(*) > 1`
  );
  check('no duplicate item_codes', dupRes.rows.length === 0, JSON.stringify(dupRes.rows));
  const badCodes = await pool.query(
    `SELECT item_code FROM items WHERE item_code !~ '^(ELE|HRD|SFE|CMP|OFF)-[0-9]+$'`
  );
  check('all item codes follow <PREFIX>-N convention', badCodes.rows.length === 0, JSON.stringify(badCodes.rows));

  // ---- 3. Stock balance integrity ------------------------------------------
  const balMismatch = await pool.query(
    `SELECT i.item_code FROM items i
     JOIN item_warehouse_stock iws ON iws.item_id = i.id AND iws.warehouse_id = i.warehouse_id
     WHERE i.is_active = true AND iws.current_balance <> i.current_balance`
  );
  check('items.current_balance == item_warehouse_stock (home warehouse)', balMismatch.rows.length === 0, JSON.stringify(balMismatch.rows));

  const missingStock = await pool.query(
    `SELECT i.item_code FROM items i
     LEFT JOIN item_warehouse_stock iws ON iws.item_id = i.id AND iws.warehouse_id = i.warehouse_id
     WHERE i.is_active = true AND (iws.id IS NULL OR iws.current_balance <= 0)`
  );
  check('every item has stocked home-warehouse balance', missingStock.rows.length === 0, JSON.stringify(missingStock.rows));

  const totalStock = await pool.query(`SELECT COALESCE(SUM(current_balance),0)::float8 AS total FROM item_warehouse_stock`);
  const expectedTotal = ITEMS.reduce((sum, i) => sum + i.opening_quantity, 0);
  check(`total warehouse stock = ${expectedTotal}`, Math.abs(totalStock.rows[0].total - expectedTotal) < 0.001, `(got ${totalStock.rows[0].total})`);

  // ---- 4. Stock split per warehouse ----------------------------------------
  const expectedPerWh: Record<string, number> = {};
  for (const i of ITEMS) expectedPerWh[i.warehouse_code] = (expectedPerWh[i.warehouse_code] || 0) + i.opening_quantity;
  const stockPerWh = await pool.query(
    `SELECT w.code, COALESCE(SUM(iws.current_balance),0)::float8 AS total, COUNT(DISTINCT iws.item_id)::int AS items
       FROM item_warehouse_stock iws JOIN warehouses w ON w.id = iws.warehouse_id
      WHERE w.code IN ($1, $2) GROUP BY w.code`,
    [WAREHOUSE_ENG, WAREHOUSE_IT]
  );
  const eng = stockPerWh.rows.find((r: any) => r.code === WAREHOUSE_ENG);
  const it = stockPerWh.rows.find((r: any) => r.code === WAREHOUSE_IT);
  check(
    `${WAREHOUSE_ENG}: 13 items / ${expectedPerWh[WAREHOUSE_ENG]} units`,
    eng && eng.items === 13 && Math.abs(eng.total - expectedPerWh[WAREHOUSE_ENG]) < 0.001,
    JSON.stringify(eng)
  );
  check(
    `${WAREHOUSE_IT}: 7 items / ${expectedPerWh[WAREHOUSE_IT]} units`,
    it && it.items === 7 && Math.abs(it.total - expectedPerWh[WAREHOUSE_IT]) < 0.001,
    JSON.stringify(it)
  );

  const sharedItems = await pool.query(
    `SELECT item_id, COUNT(*)::int AS whs FROM item_warehouse_stock GROUP BY item_id HAVING COUNT(*) > 1`
  );
  check('no item stocked in two warehouses', sharedItems.rows.length === 0, JSON.stringify(sharedItems.rows));

  // ---- 5. Reference integrity ----------------------------------------------
  const badCat = await pool.query(`SELECT i.item_code FROM items i LEFT JOIN categories c ON c.code = i.category_code WHERE c.code IS NULL`);
  check('no items with missing category', badCat.rows.length === 0, JSON.stringify(badCat.rows));
  const badUnit = await pool.query(`SELECT i.item_code FROM items i LEFT JOIN units u ON u.code = i.unit_code WHERE u.code IS NULL`);
  check('no items with missing unit', badUnit.rows.length === 0, JSON.stringify(badUnit.rows));
  const badWh = await pool.query(`SELECT i.item_code FROM items i LEFT JOIN warehouses w ON w.id = i.warehouse_id WHERE w.id IS NULL`);
  check('no items with missing warehouse', badWh.rows.length === 0, JSON.stringify(badWh.rows));
  const badSub = await pool.query(
    `SELECT i.item_code FROM items i JOIN subcategories sc ON sc.id = i.subcategory_id
      WHERE sc.category_code <> i.category_code`
  );
  check('no item subcategory outside its category', badSub.rows.length === 0, JSON.stringify(badSub.rows));
  const nullBalance = await pool.query(`SELECT item_code FROM items WHERE current_balance IS NULL OR current_balance < 0`);
  check('no null/negative balances', nullBalance.rows.length === 0, JSON.stringify(nullBalance.rows));

  // ---- 6. Movements ----------------------------------------------------------
  const movIssues = await pool.query(
    `SELECT sm.id FROM stock_movements sm
      LEFT JOIN items i ON i.id = sm.item_id
      LEFT JOIN transactions t ON t.id = sm.transaction_id
     WHERE sm.is_active = true AND (i.id IS NULL OR t.id IS NULL OR sm.warehouse_id IS NULL)`
  );
  check('no orphaned or un-attributed movements', movIssues.rows.length === 0, JSON.stringify(movIssues.rows));

  const wrongAfter = await pool.query(
    `SELECT sm.item_id FROM stock_movements sm
     WHERE sm.is_active = true AND sm.movement_type = 'IN'
       AND sm.quantity_after <> (SELECT iws.current_balance FROM item_warehouse_stock iws WHERE iws.item_id = sm.item_id AND iws.warehouse_id = sm.warehouse_id)`
  );
  check('every IN movement quantity_after == current balance', wrongAfter.rows.length === 0, JSON.stringify(wrongAfter.rows));

  const movCount = await pool.query(
    `SELECT i.item_code, COUNT(sm.id)::int AS ins
       FROM items i JOIN stock_movements sm ON sm.item_id = i.id AND sm.movement_type = 'IN'
      WHERE i.is_active = true GROUP BY i.item_code HAVING COUNT(sm.id) <> 1`
  );
  check('every item has exactly one IN (receiving) movement', movCount.rows.length === 0, JSON.stringify(movCount.rows));

  // ---- 7. Transactions --------------------------------------------------------
  const voucherCount = await pool.query(
    `SELECT t.transaction_no, t.warehouse_id, COUNT(td.id)::int AS lines, t.notes
       FROM transactions t JOIN transaction_details td ON td.transaction_id = t.id
      WHERE t.notes LIKE '%' || $1 || '%'
      GROUP BY t.id, t.transaction_no, t.warehouse_id, t.notes
      ORDER BY t.transaction_no`,
    [SEED_MARKER]
  );
  check('seeded receiving vouchers are approved (2 expected)', voucherCount.rows.length === 2, JSON.stringify(voucherCount.rows));
  for (const v of voucherCount.rows) {
    check(`  ${v.transaction_no}: ${v.lines} line(s) — approved RV`, true, v.notes || '');
  }

  const draftSeed = await pool.query(
    `SELECT transaction_no FROM transactions WHERE notes LIKE '%' || $1 || '%' AND status <> 'approved'`,
    [SEED_MARKER]
  );
  check('no unapproved seeded vouchers', draftSeed.rows.length === 0, JSON.stringify(draftSeed.rows));

  const noJournal = await pool.query(
    `SELECT t.transaction_no FROM transactions t
     WHERE t.notes LIKE '%' || $1 || '%' AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.transaction_id = t.id)`,
    [SEED_MARKER]
  );
  check('every seeded voucher has a journal entry', noJournal.rows.length === 0, JSON.stringify(noJournal.rows));

  // ---- 8. Batches -----------------------------------------------------------
  const missingBatch = await pool.query(
    `SELECT i.item_code FROM items i
      LEFT JOIN batches b ON b.item_id = i.id AND b.warehouse_id = i.warehouse_id
     WHERE i.is_active = true AND b.id IS NULL`
  );
  check('every item has a batch in its home warehouse', missingBatch.rows.length === 0, JSON.stringify(missingBatch.rows));

  // ---- 9. Authorization (service-level scoping) ------------------------------
  const adminCtx = await loadAuthContext((await pool.query(`SELECT id FROM users WHERE username = 'admin'`)).rows[0].id);
  const m1Ctx = await loadAuthContext((await pool.query(`SELECT id FROM users WHERE username = 'warehouse.manager1'`)).rows[0].id);
  const m2Ctx = await loadAuthContext((await pool.query(`SELECT id FROM users WHERE username = 'warehouse.manager2'`)).rows[0].id);

  const adminItems = await itemsService.getAll(1, 500, undefined, adminCtx);
  const m1Items = await itemsService.getAll(1, 500, undefined, m1Ctx);
  const m2Items = await itemsService.getAll(1, 500, undefined, m2Ctx);
  check('admin sees all 20 items', adminItems.pagination.total === 20, `(got ${adminItems.pagination.total})`);
  check('warehouse.manager1 sees only 13 Engineering items', m1Items.pagination.total === 13, `(got ${m1Items.pagination.total})`);
  check('warehouse.manager2 sees only 7 IT items', m2Items.pagination.total === 7, `(got ${m2Items.pagination.total})`);

  const wrongScope = m1Items.items.some((i: any) => i.warehouse_id !== 24) || m2Items.items.some((i: any) => i.warehouse_id !== 25);
  check('manager item lists contain no out-of-scope rows', !wrongScope);

  check('sub_warehouse_manager lacks items:create (business rule)', !m1Ctx.permissions.includes('items:create'));
  check('sub_warehouse_manager lacks categories:create (business rule)', !m2Ctx.permissions.includes('categories:create'));
  check('admin has items:create + categories:create', adminCtx.permissions.includes('items:create') && adminCtx.permissions.includes('categories:create'));

  log('');
  if (failures === 0) {
    log('All verify checks passed.');
  } else {
    throw new Error(`${failures} verify check(s) failed.`);
  }
}

main().catch(async (err: any) => {
  console.error('');
  console.error('ERROR — aborting:');
  console.error(`  ${err.message}`);
  process.exitCode = 1;
  try {
    const { pool } = await import('../src/config/database');
    await pool.end();
  } catch {
    /* pool may not have been created */
  }
});
