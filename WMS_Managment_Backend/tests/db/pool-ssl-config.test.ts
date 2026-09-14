import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock the pg driver so the shared pool factory can be inspected without
// opening a real database connection.
jest.mock('pg', () => {
  const PoolMock = jest.fn().mockImplementation(() => ({
    on: jest.fn().mockReturnThis(),
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  }));
  return { Pool: PoolMock };
});

let tmpCaFile: string;

beforeAll(() => {
  tmpCaFile = path.join(os.tmpdir(), `wms-test-ca-${Date.now()}.pem`);
  fs.writeFileSync(tmpCaFile, '-----BEGIN CERTIFICATE-----\nDUMMY TEST CA\n-----END CERTIFICATE-----');
});

afterAll(() => {
  if (fs.existsSync(tmpCaFile)) fs.unlinkSync(tmpCaFile);
});

type EnvOverrides = Record<string, string | undefined>;

/**
 * Loads the shared pool module with the given process.env overrides and
 * returns the Pool constructor config that was used.
 */
function loadPoolConfig(overrides: EnvOverrides): any {
  jest.resetModules();

  const previous: EnvOverrides = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }

  const baseEnv = {
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: process.env.JWT_SECRET || 'x'.repeat(32),
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'x'.repeat(32),
    NODE_ENV: 'test',
  };

  try {
    const poolMock = (require('pg') as any).Pool as jest.Mock;
    poolMock.mockClear();
    require('../../src/config/database');
    const config = poolMock.mock.calls[0]?.[0];
    expect(config).toBeDefined();
    expect(config.connectionString).toBe(baseEnv.DATABASE_URL);
    return config;
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

describe('pool SSL config (Aiven / cloud)', () => {
  it('uses no SSL by default in non-production environments', () => {
    const config = loadPoolConfig({ DB_SSL: undefined });
    expect(config.ssl).toBeUndefined();
  });

  it('uses no SSL when DB_SSL=false (explicit local opt-out)', () => {
    const config = loadPoolConfig({ DB_SSL: 'false', NODE_ENV: 'production' });
    expect(config.ssl).toBeUndefined();
  });

  it('enables TLS with rejectUnauthorized and no CA when DB_SSL=true without CA path', () => {
    const config = loadPoolConfig({ DB_SSL: 'true', DB_SSL_CA_PATH: undefined });
    expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: undefined });
  });

  it('loads the CA certificate when DB_SSL_CA_PATH is set', () => {
    const config = loadPoolConfig({ DB_SSL: 'true', DB_SSL_CA_PATH: tmpCaFile });
    expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: fs.readFileSync(tmpCaFile, 'utf8') });
  });

  it('honours DB_SSL_REJECT_UNAUTHORIZED=false (skip certificate verification)', () => {
    const config = loadPoolConfig({
      DB_SSL: 'true',
      DB_SSL_CA_PATH: tmpCaFile,
      DB_SSL_REJECT_UNAUTHORIZED: 'false',
    });
    expect(config.ssl).toEqual({ rejectUnauthorized: false, ca: fs.readFileSync(tmpCaFile, 'utf8') });
  });

  it('keeps the legacy forced-TLS production behavior when DB_SSL is unset', () => {
    const config = loadPoolConfig({ DB_SSL: undefined, NODE_ENV: 'production' });
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('reports only non-sensitive connection info (host + ssl flag)', () => {
    jest.resetModules();
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://avnadmin:secret@db-xyz.aivencloud.com:13000/defaultdb?sslmode=require';
    process.env.NODE_ENV = 'test';
    process.env.DB_SSL = 'true';
    try {
      const { getConnectionInfo } = require('../../src/config/database');
      const info = getConnectionInfo();
      expect(info).toEqual({ ssl: true, host: 'db-xyz.aivencloud.com' });
      expect(JSON.stringify(info)).not.toContain('secret');
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});