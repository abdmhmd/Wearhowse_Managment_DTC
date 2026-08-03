import { Pool, PoolClient } from 'pg';
import { env } from '../utils/env';
import { logger } from '../utils/logger';

const isTest = process.env.NODE_ENV === 'test';

const poolConfig: any = {
  connectionString: env.DATABASE_URL,
  max: isTest ? 3 : 20,
  idleTimeoutMillis: isTest ? 60000 : 30000,
  connectionTimeoutMillis: isTest ? 30000 : 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

if (env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: true };
}

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', 'Database', { error: err.message });
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}

export async function runInTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
