import fs from 'fs';
import { Pool, PoolClient } from 'pg';
import { env } from '../utils/env';
import { logger } from '../utils/logger';

const isTest = process.env.NODE_ENV === 'test';

// PostgreSQL TLS (Aiven / cloud) support. The three switches interact as:
//   - DB_SSL=true            → TLS enabled. When DB_SSL_CA_PATH points at a CA
//                              certificate the server cert is verified against
//                              it (sslmode ≈ verify-ca/verify-full). Without a
//                              CA path, TLS is used without cert verification
//                              (sslmode ≈ require) unless
//                              DB_SSL_REJECT_UNAUTHORIZED=false is set.
//   - DB_SSL=false           → TLS explicitly disabled (local development).
//   - DB_SSL unset           → legacy behavior preserved: production assumes
//                              TLS with rejectUnauthorized:true, tests and
//                              development keep plain connections.
const dbSslFlag = process.env.DB_SSL ?? '';
const useSSL = dbSslFlag === 'true';
const sslExplicitlyDisabled = dbSslFlag === 'false';

const poolConfig: any = {
  connectionString: env.DATABASE_URL,
  max: isTest ? 3 : 20,
  idleTimeoutMillis: isTest ? 60000 : 30000,
  connectionTimeoutMillis: isTest ? 30000 : 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

if (useSSL) {
  poolConfig.ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DB_SSL_CA_PATH
      ? fs.readFileSync(process.env.DB_SSL_CA_PATH).toString()
      : undefined,
  };
} else if (!sslExplicitlyDisabled && env.NODE_ENV === 'production') {
  // Legacy production behavior (kept so existing deployments without DB_SSL
  // keep working): TLS is forced with system CA verification.
  poolConfig.ssl = { rejectUnauthorized: true };
}

export const pool = new Pool(poolConfig);

pool.on('connect', () => {
  logger.debug('New DB connection established', 'Database');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', 'Database', { error: err.message });
});

/**
 * Non-sensitive connection facts for logs and the health endpoint.
 * Never includes the password or the full connection string.
 */
export function getConnectionInfo(): { ssl: boolean; host: string } {
  let host = '(unknown)';
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    host = '(invalid DATABASE_URL)';
  }
  return { ssl: useSSL, host };
}

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
