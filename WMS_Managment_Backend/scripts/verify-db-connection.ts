import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { pool } = require('../src/config/database') as typeof import('../src/config/database');

async function verify() {
  try {
    const client = await pool.connect();
    console.log('Pool connected OK');

    const res = await client.query('SELECT 1 AS ok');
    console.log(`SELECT 1 => ${res.rows[0].ok}`);

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log(`Tables (${tables.rowCount}):`);
    for (const row of tables.rows) {
      console.log(`  - ${row.table_name}`);
    }

    client.release();
    await pool.end();
    console.log('Done — pool closed cleanly');
  } catch (err: any) {
    console.error(`FAILED: ${err.message}`);
    if (err.code) console.error(`  PostgreSQL code: ${err.code}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

verify();
