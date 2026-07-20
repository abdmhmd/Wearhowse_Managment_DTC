import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkAdmin(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, username, password_hash, is_active, role FROM users WHERE username = $1',
      ['admin']
    );

    if (result.rows.length === 0) {
      console.log('ERROR: No user with username "admin" found in the database.');
      return;
    }

    const user = result.rows[0];
    console.log('=== Admin User State ===');
    console.log(`  id:            ${user.id}`);
    console.log(`  username:      ${user.username}`);
    console.log(`  is_active:     ${user.is_active}`);
    console.log(`  role:          ${user.role}`);
    console.log(`  password_hash: ${user.password_hash.substring(0, 10)}...`);

    console.log('\n=== Password Verification ===');
    const candidate1 = 'Admin@123';
    const candidate2 = 'TestPassword123!';

    const match1 = await bcrypt.compare(candidate1, user.password_hash);
    const match2 = await bcrypt.compare(candidate2, user.password_hash);

    console.log(`  "${candidate1}" matches: ${match1}`);
    console.log(`  "${candidate2}" matches: ${match2}`);

    if (!match1 && !match2) {
      console.log('\nWARNING: Neither candidate password matches the stored hash!');
      console.log('The admin password needs to be reset.');
    } else if (match1) {
      console.log('\nOK: Password "Admin@123" is valid. The 401 is NOT a password issue.');
    } else {
      console.log('\nOK: Password "TestPassword123!" is valid. Update the frontend to use this password.');
    }
  } finally {
    client.release();
  }
}

checkAdmin()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Check failed:', err.message);
    await pool.end();
    process.exit(1);
  });
