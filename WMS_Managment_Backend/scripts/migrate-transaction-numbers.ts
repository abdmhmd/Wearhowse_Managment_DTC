import { pool } from '../src/config/database';

async function migrate() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, type, transaction_no, created_at FROM transactions ORDER BY id`
    );

    let updated = 0;
    for (const row of res.rows) {
      if (!row.transaction_no || row.transaction_no.startsWith('TXN-')) {
        const year = row.created_at?.getFullYear() || new Date().getFullYear();
        const seq = String(row.id).padStart(6, '0');
        const newNo = `${row.type}-${year}-${seq}`;
        await client.query(
          'UPDATE transactions SET transaction_no = $1 WHERE id = $2',
          [newNo, row.id]
        );
        console.log(`  ${row.id}: ${row.transaction_no || '(null)'} → ${newNo}`);
        updated++;
      }
    }

    console.log(`\nDone. ${updated} transactions updated.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
