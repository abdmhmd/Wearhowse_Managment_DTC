// A 6 s window keeps the limit reachable even though every failed login now
// carries a ~200 ms constant-time floor (login hardening): with a 1 s window
// the first attempts expire before a fourth arrives, so the 429 could never
// fire. The semantics under test (max allowed -> 429 on the next -> free after
// the window) are unchanged.
process.env.LOGIN_RATE_LIMIT_MAX = '3';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '6000';

import request from 'supertest';
import type { Application } from 'express';

let app: Application;

beforeAll(async () => {
  app = (await import('../../src/app')).default;
});

describe('Login rate limiting', () => {
  it('allows up to the configured number of attempts', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'rate-limit-nouser', password: 'wrong-password' });
      expect(res.status).toBe(401);
    }
  });

  it('returns 429 with a clear message once the limit is exceeded', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rate-limit-nouser', password: 'wrong-password' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: {
        message: 'Too many login attempts. Please try again later.',
        code: 'TOO_MANY_REQUESTS',
      },
    });
  });

  it('allows login again after the window resets', async () => {
    await new Promise((resolve) => setTimeout(resolve, 6200));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rate-limit-nouser', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });
});
