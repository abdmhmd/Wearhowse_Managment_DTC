import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../src/config/database';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MIGRATIONS_TABLE = '_migrations';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function parseArgs(): { down?: string; verify: boolean; force: boolean } {
  const args = process.argv.slice(2);
  let down: string | undefined;
  let verify = false;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--down') {
      down = args[i + 1];
      i++;
    } else if (args[i] === '--verify') {
      verify = true;
    } else if (args[i] === '--force') {
      force = true;
    }
  }
  return { down, verify, force };
}

function listMigrationFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
}

async function ensureMigrationsTable(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT
    )
  `);
  await client.query(
    `ALTER TABLE ${MIGRATIONS_TABLE} ADD COLUMN IF NOT EXISTS checksum TEXT`
  );
}

/**
 * Verifies that already-applied migrations still match the source files on
 * disk (migration_checksum verification). A NULL stored checksum is backfilled
 * from the current file so older databases are verified from this run onward.
 * Returns true when everything is consistent (or --force was passed).
 */
async function verifyChecksums(client: any, migrationsDir: string, files: string[], force: boolean): Promise<boolean> {
  const applied = await client.query(
    `SELECT filename, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`
  );
  const mismatches: string[] = [];

  for (const row of applied.rows) {
    if (!files.includes(row.filename)) continue; // archived / renamed files are ignored

    const content = fs.readFileSync(path.join(migrationsDir, row.filename), 'utf8');
    const current = sha256(content);

    if (!row.checksum) {
      await client.query(
        `UPDATE ${MIGRATIONS_TABLE} SET checksum = $1 WHERE filename = $2`,
        [current, row.filename]
      );
      console.log(`  · backfilled checksum for ${row.filename}`);
      continue;
    }

    if (row.checksum !== current) {
      mismatches.push(
        `${row.filename} (recorded ${row.checksum.slice(0, 12)}…, disk ${current.slice(0, 12)}…)`
      );
    }
  }

  if (mismatches.length) {
    if (force) {
      console.warn(
        `⚠ Checksum mismatch but --force passed; the applied file now on disk will be re-recorded for:`
      );
      for (const m of mismatches) {
        const filename = m.split(' (')[0];
        const current = sha256(fs.readFileSync(path.join(migrationsDir, filename), 'utf8'));
        await client.query(
          `UPDATE ${MIGRATIONS_TABLE} SET checksum = $1 WHERE filename = $2`,
          [current, filename]
        );
        console.warn(`  · ${filename}`);
      }
      return true;
    }
    console.error('✗ migration_checksum verification FAILED: applied files were modified on disk:');
    for (const m of mismatches) console.error(`  · ${m}`);
    console.error('  Re-run with --force only if you intentionally edited an applied migration.');
    return false;
  }

  return true;
}

async function runDown(client: any, migrationsDir: string, downArg: string): Promise<void> {
  const base = downArg.replace(/\.sql$/i, '');
  const filename = `${base}.down.sql`;
  const filePath = path.join(migrationsDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`DOWN file not found: ${filename}`);
  }

  const recorded = await client.query(
    `SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE filename = $1`,
    [`${base}.sql`]
  );
  if (recorded.rows.length === 0) {
    console.log(`  · ${base}.sql is not recorded as applied; skipping rollback.`);
    return;
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE filename = $1`, [`${base}.sql`]);
    await client.query('COMMIT');
    console.log(`  ✓ Rolled back: ${base}.sql (via ${filename})`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function runMigrations() {
  const { down, verify, force } = parseArgs();
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = listMigrationFiles(migrationsDir);

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    if (down) {
      await runDown(client, migrationsDir, down);
      return;
    }

    const ok = await verifyChecksums(client, migrationsDir, files, force);
    if (!ok) {
      throw new Error('Aborting: migration checksum verification failed.');
    }

    if (verify) {
      const applied = await client.query(
        `SELECT filename, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`
      );
      console.log('Verify-only run. No migrations applied.');
      console.log(`Applied (${applied.rows.length}):`);
      for (const r of applied.rows) console.log(`  · ${r.filename}  ${(r.checksum || '').slice(0, 12)}…`);
      const pending = files.filter((f) => !applied.rows.some((a: any) => a.filename === f));
      console.log(`Pending (${pending.length}):`);
      for (const f of pending) console.log(`  · ${f}`);
      return;
    }

    const applied = await client.query('SELECT filename FROM ' + MIGRATIONS_TABLE);
    const appliedSet = new Set(applied.rows.map((r: any) => r.filename));

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = sha256(sql);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (filename, checksum) VALUES ($1, $2)`,
          [file, checksum]
        );
        await client.query('COMMIT');
        console.log(`  ✓ Applied: ${file}  (${checksum.slice(0, 12)}…)`);
        count++;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed: ${file}`, error);
        throw error;
      }
    }

    if (count === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`\nApplied ${count} migration(s) successfully.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
