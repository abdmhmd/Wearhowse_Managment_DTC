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
const FULL_NAME = 'System Administrator';
const ROLE = 'admin';
const SALT_ROUNDS = 10;

async function seedAdmin(): Promise<void> {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [USERNAME]
    );
    if (existing.rows.length > 0) {
      console.log(`User "${USERNAME}" already exists (id: ${existing.rows[0].id}). Skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

    const result = await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, username, role`,
      [USERNAME, passwordHash, FULL_NAME, ROLE]
    );

    const user = result.rows[0];
    console.log(`Admin user created successfully:`);
    console.log(`  id:       ${user.id}`);
    console.log(`  username: ${user.username}`);
    console.log(`  role:     ${user.role}`);
    console.log(`\nLogin credentials:`);
    console.log(`  username: ${USERNAME}`);
    console.log(`  password: ${PASSWORD}`);
  } finally {
    client.release();
  }
}

seedAdmin()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  });
