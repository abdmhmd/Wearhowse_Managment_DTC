import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const USERNAME = 'admin';
const PASSWORD = 'Admin@123';
const SALT_ROUNDS = 10;

async function resetPassword(): Promise<void> {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [USERNAME]
    );
    if (existing.rows.length === 0) {
      console.log(`ERROR: No user with username "${USERNAME}" found. Run seed-admin.ts first.`);
      return;
    }

    const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

    await client.query(
      `UPDATE users SET password_hash = $1, is_active = true WHERE username = $2`,
      [passwordHash, USERNAME]
    );

    console.log(`Admin password reset to '${PASSWORD}'. Please try logging in now.`);

    // Verify the update
    const verify = await client.query(
      'SELECT password_hash FROM users WHERE username = $1',
      [USERNAME]
    );
    const match = await bcrypt.compare(PASSWORD, verify.rows[0].password_hash);
    console.log(`Verification: password match = ${match}`);
  } finally {
    client.release();
  }
}

resetPassword()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Reset failed:', err.message);
    await pool.end();
    process.exit(1);
  });
