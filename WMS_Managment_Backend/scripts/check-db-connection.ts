import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const rawUrl = process.env.DATABASE_URL || '';
const masked = rawUrl.replace(/:([^@]+)@/, ':***@');
console.log(`DATABASE_URL (masked): ${masked}`);
console.log('');

async function tryConnect(label: string, connectionString: string) {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    console.log(`[${label}] CONNECTED`);

    const res = await client.query('SELECT 1 AS ok');
    console.log(`[${label}] SELECT 1 => ok=${res.rows[0].ok}`);

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log(`[${label}] Tables (${tables.rowCount}):`);
    for (const row of tables.rows) {
      console.log(`  - ${row.table_name}`);
    }

    client.release();
    await pool.end();
    return true;
  } catch (err: any) {
    console.log(`[${label}] FAILED: ${err.message}`);
    if (err.code) console.log(`  PostgreSQL error code: ${err.code}`);
    if (err.detail) console.log(`  Detail: ${err.detail}`);
    await pool.end().catch(() => {});
    return false;
  }
}

async function main() {
  const db = process.env.PGDATABASE || 'WMS_DB';
  const user = process.env.PGUSER || 'postgres';
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';

  const variants: [string, string][] = [
    ['current .env', rawUrl],
    ['no password', `postgresql://${user}@${host}:${port}/${db}`],
    ['no password + sslmode=disable', `postgresql://${user}@${host}:${port}/${db}?sslmode=disable`],
    ['127.0.0.1 no password', `postgresql://${user}@127.0.0.1:${port}/${db}`],
    ['lowercase db no password', `postgresql://${user}@${host}:${port}/wms_db`],
    ['password 123456 + sslmode=disable', `postgresql://${user}:123456@${host}:${port}/${db}?sslmode=disable`],
  ];

  for (const [label, url] of variants) {
    console.log(`\n--- Trying: ${label} ---`);
    const ok = await tryConnect(label, url);
    if (ok) {
      console.log(`\n✓ Working connection string: ${url.replace(/:([^@]+)@/, ':***@')}`);
      break;
    }
  }
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(1);
});
