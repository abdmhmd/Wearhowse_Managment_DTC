import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './utils/env';
validateEnv();

import app from './app';
import { pool, testConnection } from './config/database';
import { env } from './utils/env';

const server = app.listen(env.PORT, async () => {
  const dbOk = await testConnection();
  console.log(`Server running on port ${env.PORT} | DB: ${dbOk ? 'connected' : 'unavailable'}`);
});

function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
