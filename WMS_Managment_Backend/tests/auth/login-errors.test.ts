// Broad rate-limit budget for this suite: the progressive-delay hardening
// makes each failed login take at least ~200 ms (plus bcrypt), so the tight
// 3-per-6s window used in rate-limit.test.ts would otherwise trip here. A
// 50-per-60s window keeps the limiter out of the way while we assert the
// per-attempt response contract.
process.env.LOGIN_RATE_LIMIT_MAX = '50';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';

import request from 'supertest';
import type { Application } from 'express';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { usersRepository } from '../../src/modules/users/users.repository';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

let app: Application;

const prefix = `${TEST_PREFIX}loginerr_`;

beforeAll(async () => {
  app = (await import('../../src/app')).default;
});

afterAll(async () => {
  await cleanup(prefix);
  await pool.end();
});

async function seedUser(overrides: Partial<{ is_active: boolean; role: string }> = {}): Promise<{
  username: string;
  password: string;
}> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}${shortId()}`;
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [username, password_hash, `Test ${username}`, overrides.role ?? 'admin', overrides.is_active ?? true]
  );
  return { username, password };
}

async function login(username: string, password: string) {
  return request(app).post('/api/auth/login').send({ username, password });
}

function errorBody(res: any) {
  return res.body.error ?? {};
}

describe('Login error UX (anti-enumeration + reset hint)', () => {
  test('unknown username returns the generic credentials error, not a "not found" hint', async () => {
    const res = await login(`${prefix}ghost_${shortId()}`, 'somePassword');
    expect(res.status).toBe(401);
    expect(errorBody(res).code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(errorBody(res).message).toBe('Invalid credentials');
    expect(errorBody(res).details.attempt_count).toBe(1);
    expect(errorBody(res).details.show_reset_hint).toBe(false);
  });

  test('wrong password is byte-for-byte identical to unknown username (no enumeration)', async () => {
    const { username, password } = await seedUser();
    const wrong = await login(username, 'definitely-wrong');
    const ghost = await login(`${prefix}ghost_${shortId()}`, 'somePassword');

    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(errorBody(wrong).code).toBe(errorBody(ghost).code);
    expect(errorBody(wrong).message).toBe(errorBody(ghost).message);
    expect(errorBody(wrong).details).toEqual(errorBody(ghost).details);
  });

  test('missing fields return the generic credentials error', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(401);
    expect(errorBody(res).code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(errorBody(res).message).toBe('Invalid credentials');
  });

  test('three consecutive failures return attempt_count 3 and show_reset_hint true', async () => {
    const { username, password } = await seedUser();
    let last: request.Response;
    for (let i = 0; i < 3; i++) {
      last = await login(username, 'definitely-wrong');
    }
    expect(last!.status).toBe(401);
    expect(errorBody(last!).details.attempt_count).toBe(3);
    expect(errorBody(last!).details.show_reset_hint).toBe(true);
  });

  test('a successful login resets the failure streak for that username', async () => {
    const { username, password } = await seedUser();
    await login(username, 'definitely-wrong');
    await login(username, 'definitely-wrong');
    const ok = await login(username, password);
    expect(ok.status).toBe(200);

    const res = await login(username, 'definitely-wrong');
    expect(errorBody(res).details.attempt_count).toBe(1);
    expect(errorBody(res).details.show_reset_hint).toBe(false);
  });

  test('inactive account returns AUTH_ACCOUNT_DISABLED (no attempt metadata)', async () => {
    const { username } = await seedUser({ is_active: false });
    const res = await login(username, 'testPass123');
    expect(res.status).toBe(401);
    expect(errorBody(res).code).toBe('AUTH_ACCOUNT_DISABLED');
    expect(errorBody(res).details).toBeUndefined();
  });

  test('deactivated legacy role returns AUTH_ROLE_DISABLED (no attempt metadata)', async () => {
    const legacyUser = `${prefix}legacy_${shortId()}`;
    const spy = jest
      .spyOn(usersRepository, 'findByUsername')
      .mockResolvedValue({
        id: 999998,
        username: legacyUser,
        password_hash: 'legacyHash',
        full_name: legacyUser,
        role: 'storekeeper',
        department_id: null,
        is_active: true,
        token_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

    const res = await login(legacyUser, 'irrelevant');
    expect(res.status).toBe(401);
    expect(errorBody(res).code).toBe('AUTH_ROLE_DISABLED');
    expect(errorBody(res).details).toBeUndefined();

    spy.mockRestore();
  });

  test('the fifth consecutive failure applies the progressive delay (>= 900 ms)', async () => {
    const { username, password } = await seedUser();
    for (let i = 0; i < 4; i++) {
      const res = await login(username, 'definitely-wrong');
      expect(res.status).toBe(401);
      expect(errorBody(res).details.attempt_count).toBe(i + 1);
    }
    const started = Date.now();
    const fifth = await login(username, 'definitely-wrong');
    const elapsed = Date.now() - started;

    expect(fifth.status).toBe(401);
    expect(errorBody(fifth).details.attempt_count).toBe(5);
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});