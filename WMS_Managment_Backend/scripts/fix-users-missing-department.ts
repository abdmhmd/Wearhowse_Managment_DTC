import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Confirmed assignments (validated against each user's warehouse linkage and
// approved by the owner): md_wh -> MD (16), hamza_subw -> IT-Deap (6).
const FIXES: Array<{ id: number; department_id: number }> = [
  { id: 33, department_id: 16 },
  { id: 9, department_id: 6 },
];

(async () => {
  const db = await pool.query('SELECT current_database() AS name');
  console.log(`Database: ${db.rows[0].name}\n`);

  for (const fix of FIXES) {
    const res = await pool.query(
      `UPDATE users
          SET department_id = $2
        WHERE id = $1
          AND department_id IS NULL
          AND role IN ('sub_warehouse_manager', 'department_manager', 'supervisor')
        RETURNING id, username, role, department_id`,
      [fix.id, fix.department_id]
    );
    if (res.rows.length === 0) {
      console.log(`user id=${fix.id}: not changed (already assigned or mismatched)`);
    } else {
      const row = res.rows[0];
      console.log(`user id=${row.id} (${row.username}, ${row.role}): department_id -> ${row.department_id}`);
    }
  }

  const remaining = await pool.query(
    `SELECT id, username, role FROM users
      WHERE role IN ('sub_warehouse_manager', 'department_manager', 'supervisor')
        AND department_id IS NULL`
  );
  console.log(`\nRemaining users without a department: ${remaining.rows.length}`);
  for (const u of remaining.rows) {
    console.log(`  id=${u.id} role=${u.role} username=${u.username}`);
  }

  await pool.end();
})().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});