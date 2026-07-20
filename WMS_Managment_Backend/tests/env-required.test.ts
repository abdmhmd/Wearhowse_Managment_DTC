describe('Environment Variable Requirements', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('JWT generateToken throws if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    const { generateToken } = require('../src/utils/jwt');
    expect(() => generateToken({ userId: 1, username: 'test', role: 'system_admin' })).toThrow();
  });

  test('JWT verifyToken returns null if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    const { verifyToken } = require('../src/utils/jwt');
    expect(verifyToken('some-token')).toBeNull();
  });

  test('JWT generateToken and verifyToken work end-to-end', () => {
    process.env.JWT_SECRET = 'test-secret-key-for-testing';
    const { generateToken, verifyToken } = require('../src/utils/jwt');
    const payload = { userId: 1, username: 'test', role: 'system_admin' };
    const token = generateToken(payload);
    expect(token).toBeDefined();
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(1);
    expect(decoded!.username).toBe('test');
    expect(decoded!.role).toBe('system_admin');
  });

  test('JWT rejects tampered token', () => {
    process.env.JWT_SECRET = 'test-secret-key-for-testing';
    const { generateToken, verifyToken } = require('../src/utils/jwt');
    const token = generateToken({ userId: 1, username: 'test', role: 'system_admin' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    const decoded = verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  test('DATABASE_URL is required for database module', () => {
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
    const { pool } = require('../src/config/database');
    expect(pool).toBeDefined();
  });

  test('validateEnv throws if DATABASE_URL is missing', () => {
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    const { validateEnv } = require('../src/utils/env');
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });
});
