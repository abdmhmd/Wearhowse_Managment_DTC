import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const poolConfig: any = {
  connectionString: process.env.DATABASE_URL,
};

if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: true };
}

const pool = new Pool(poolConfig);

const USERNAME = 'admin';
const PASSWORD = 'admin123';
const SALT_ROUNDS = 10;

async function resetPassword(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  const res = await pool.query(
    `UPDATE users SET password_hash = $1, is_active = true WHERE username = $2`,
    [passwordHash, USERNAME]
  );

  if (res.rowCount === 0) {
    console.log(`ERROR: No user with username "${USERNAME}" found. Run "npm run seed:admin" first.`);
    return;
  }

  const verify = await pool.query('SELECT password_hash FROM users WHERE username = $1', [USERNAME]);
  const match = await bcrypt.compare(PASSWORD, verify.rows[0].password_hash);
  console.log(`Password for "${USERNAME}" reset to "${PASSWORD}". Verification: password match = ${match}`);
}

resetPassword()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Reset failed:', err.message);
    await pool.end();
    process.exit(1);
  });
