import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const EXECUTE = process.argv.includes('--execute');
const DEV_DB = 'dtc_wms';

// ============================================================================
// repair-dev-data.ts
// Restores the intended demo topology in the LIVE DTC_WMS database:
//   * every department must own a MAIN warehouse (the stock source for
//     material-request issuance) plus its department/receiving warehouse;
//   * warehouse managers must have at least one warehouse assignment
//     (otherwise their data scope resolves to NONE and they can see nothing);
//   * department managers must be linked to their department.
//
// This is intentionally NOT a reseed: it only touches warehouses (adding
// missing main warehouses), user_warehouses and the department_id of demo
// users. All business data is preserved.
//
// Usage:
//   ts-node scripts/repair-dev-data.ts            # dry run
//   ts-node scripts/repair-dev-data.ts --execute  # apply
// ============================================================================

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

    // ---- 1. Department -> main warehouse topology ---------------------------------
    const depts = await client.query(
      `SELECT d.id, d.code, d.name_ar,
              (SELECT w.id FROM warehouses w
                WHERE w.department_id = d.id AND w.is_main = true AND w.is_active = true
                ORDER BY w.id LIMIT 1) AS main_wh_id
         FROM departments d
        WHERE d.code LIKE 'DEMO-%'
        ORDER BY d.id`
    );

    console.log('Department main-warehouse topology:');
    const missingMain: Array<{ id: number; code: string; name_ar: string }> = [];
    for (const d of depts.rows) {
      if (d.main_wh_id) {
        console.log(`  ${d.code} (${d.id}): main warehouse #${d.main_wh_id} OK`);
      } else {
        missingMain.push(d);
        console.log(`  ${d.code} (${d.id}): NO main warehouse -> will be created`);
      }
    }
    if (missingMain.length === 0) {
      console.log('  (all departments have a main warehouse)');
    }
    console.log('');

    // ---- 2. User assignments --------------------------------------------------------
    const users = await client.query(
      `SELECT id, username, role, department_id
         FROM users
        WHERE username IN ('warehouse.manager1','warehouse.manager2',
                           'department.manager1','department.manager2','department.manager3')
        ORDER BY id`
    );
    console.log('Demo users:');
    for (const u of users.rows) {
      const whs = await client.query(
        'SELECT warehouse_id FROM user_warehouses WHERE user_id = $1 ORDER BY warehouse_id',
        [u.id]
      );
      console.log(`  ${u.username} (${u.id}) role=${u.role} dept=${u.department_id ?? 'NULL'} wh=[${whs.rows.map((r) => r.warehouse_id).join(', ')}]`);
    }
    console.log('');

    if (!EXECUTE) {
      console.log('Plan:');
      if (missingMain.length > 0) {
        console.log(`  - Create ${missingMain.length} missing main warehouse(s) for: ${missingMain.map((d) => d.code).join(', ')}`);
      } else {
        console.log('  - No warehouses to create.');
      }
      console.log('  - Ensure warehouse managers have warehouse assignments.');
      console.log('  - Link department managers to their departments.');
      console.log('DRY RUN complete. Re-run with --execute to apply.');
      return;
    }

    await client.query('BEGIN');

    // ---- 3. Create missing main warehouses -------------------------------------------
    for (const d of missingMain) {
      const code = `DEMO-MAIN-${d.code.replace('DEMO-', '')}`;
      const res = await client.query(
        `INSERT INTO warehouses (code, name_ar, name_en, is_main, department_id, is_active)
         VALUES ($1, $2, $3, true, $4, true)
         RETURNING id`,
        [code, `المخزن الرئيسي - ${d.name_ar}`, `Main Warehouse - ${d.code}`, d.id]
      );
      console.log(`  created main warehouse ${code} (#${res.rows[0].id}) for ${d.code}`);
    }

    // ---- 4. Warehouse manager assignments ----------------------------------------------
    // The intended demo topology: warehouse.manager1 is assigned to the
    // engineering main + lab receiving warehouses; warehouse.manager2 to the
    // quality warehouse. Uses warehouse CODE so the topology survives ids.
    const assign = async (username: string, warehouseCodes: string[]) => {
      const u = await client.query('SELECT id FROM users WHERE username = $1', [username]);
      if (u.rows.length === 0) {
        console.warn(`  user ${username} not found, skipping warehouse assignment`);
        return;
      }
      const userId = u.rows[0].id;
      await client.query('DELETE FROM user_warehouses WHERE user_id = $1', [userId]);
      for (const code of warehouseCodes) {
        const w = await client.query('SELECT id FROM warehouses WHERE code = $1', [code]);
        if (w.rows.length === 0) {
          console.warn(`  warehouse ${code} not found, skipping assignment for ${username}`);
          continue;
        }
        await client.query(
          'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, w.rows[0].id]
        );
        console.log(`  assigned ${username} -> ${code} (#${w.rows[0].id})`);
      }
    };

    await assign('warehouse.manager1', ['DEMO-WH-1', 'DEMO-WH-2']);
    await assign('warehouse.manager2', ['DEMO-WH-3']);

    // ---- 5. Department manager departments ------------------------------------------------
    const linkDept = async (username: string, deptCode: string) => {
      const u = await client.query('SELECT id FROM users WHERE username = $1', [username]);
      if (u.rows.length === 0) {
        console.warn(`  user ${username} not found, skipping department link`);
        return;
      }
      const d = await client.query('SELECT id FROM departments WHERE code = $1', [deptCode]);
      if (d.rows.length === 0) {
        console.warn(`  department ${deptCode} not found, skipping link for ${username}`);
        return;
      }
      await client.query('UPDATE users SET department_id = $1 WHERE id = $2', [d.rows[0].id, u.rows[0].id]);
      console.log(`  linked ${username} -> ${deptCode} (#${d.rows[0].id})`);
    };

    await linkDept('department.manager1', 'DEMO-ENG');
    await linkDept('department.manager2', 'DEMO-LAB');

    // ---- 5b. Create department.manager3 if missing (DEMO-PROD) --------------------------
    const dm3 = await client.query('SELECT id FROM users WHERE username = $1', ['department.manager3']);
    if (dm3.rows.length === 0) {
      const d = await client.query('SELECT id FROM departments WHERE code = $1', ['DEMO-PROD']);
      if (d.rows.length > 0) {
        const bcrypt = (await import('bcryptjs')).default;
        const hash = await bcrypt.hash('ChangeMe123!', 10);
        const res = await client.query(
          `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active, token_version)
           VALUES ($1, $2, 'Nasser Khalil', 'department_manager', $3, true, 0) RETURNING id`,
          ['department.manager3', hash, d.rows[0].id]
        );
        console.log(`  created department.manager3 (#${res.rows[0].id}) -> DEMO-PROD`);
      }
    }

    await client.query('COMMIT');
    console.log('');
    console.log('COMMIT successful.');

    // ---- 6. Verification ---------------------------------------------------------------
    console.log('Verification:');
    for (const d of depts.rows) {
      const w = await client.query(
        `SELECT id, code FROM warehouses WHERE department_id = $1 AND is_main = true AND is_active = true`,
        [d.id]
      );
      const ok = w.rows.length > 0;
      console.log(`  ${d.code}: main warehouse ${ok ? `#${w.rows[0].id} (${w.rows[0].code})` : 'MISSING'}`);
    }
    const usersAfter = await client.query(
      `SELECT id, username, department_id
         FROM users
        WHERE username IN ('warehouse.manager1','warehouse.manager2',
                           'department.manager1','department.manager2','department.manager3')
        ORDER BY id`
    );
    for (const u of usersAfter.rows) {
      const whs = await client.query(
        `SELECT w.code FROM user_warehouses uw JOIN warehouses w ON w.id = uw.warehouse_id WHERE uw.user_id = $1 ORDER BY w.id`,
        [u.id]
      );
      const dept = await client.query('SELECT code FROM departments WHERE id = $1', [u.department_id]);
      console.log(`  ${u.username}: dept=${dept.rows[0]?.code ?? 'NULL'} wh=[${whs.rows.map((r) => r.code).join(', ')}]`);
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
