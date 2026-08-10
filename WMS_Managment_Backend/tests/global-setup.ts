import * as dotenv from 'dotenv';

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: '.env.test' });
  process.env.NODE_ENV = 'test';

  const { pool } = await import('../src/config/database');
  const { cleanupTestData } = await import('./cleanup-db');

  await cleanupTestData('test_');
  await pool.end();
}
