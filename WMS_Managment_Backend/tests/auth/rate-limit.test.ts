process.env.LOGIN_RATE_LIMIT_MAX = '3';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '1000';

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
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rate-limit-nouser', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });
});
