import dotenv from 'dotenv';
dotenv.config();

import { validateEnv, assertSafeEnv } from './utils/env';
validateEnv();
assertSafeEnv();

import app from './app';
import { pool, testConnection } from './config/database';
import { env } from './utils/env';
import { logger } from './utils/logger';

const server = app.listen(env.PORT, async () => {
  const dbOk = await testConnection();
  logger.info(`Server running on port ${env.PORT} | DB: ${dbOk ? 'connected' : 'unavailable'}`, 'Server');
});

// ─── Scheduled Cleanup: Remove expired/revoked refresh tokens every 24 hours ───
async function cleanupExpiredTokens() {
  try {
    const result = await pool.query(
      `DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL`
    );
    logger.info(`Token cleanup: removed ${result.rowCount} expired/revoked tokens`, 'Cleanup');
  } catch (err: any) {
    logger.error('Token cleanup failed', 'Cleanup', { error: err.message });
  }
}
// Run immediately on startup then every 24 hours
cleanupExpiredTokens();
const tokenCleanupInterval = setInterval(cleanupExpiredTokens, 24 * 60 * 60 * 1000);

function gracefulShutdown(signal: string) {
  logger.info(`${signal} received. Shutting down gracefully...`, 'Server');
  clearInterval(tokenCleanupInterval);
  server.close(async () => {
    await pool.end();
    logger.info('Database pool closed.', 'Server');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout', 'Server');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

