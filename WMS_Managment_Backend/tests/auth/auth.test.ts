import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { usersRepository } from '../../src/modules/users/users.repository';
import { authenticate } from '../../src/middlewares/auth.middleware';
import { generateToken } from '../../src/utils/jwt';
import { Request, Response, NextFunction } from 'express';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}auth_test_`;
let userId: number;
let username: string;
let password: string;

beforeAll(async () => {
  password = 'testPassword123';
  const password_hash = await hashPassword(password);
  username = `${prefix}${shortId()}`;
  const res = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, 'admin', true) RETURNING id`,
    [username, password_hash, username]
  );
  userId = res.rows[0].id;
});

afterAll(async () => { await cleanup(prefix); });

function mockReqRes(body: any): { req: Partial<Request>; res: Partial<Response> } {
  const json = jest.fn().mockReturnValue({});
  const status = jest.fn().mockReturnValue({ json });
  const req = { body } as Partial<Request>;
  const res = { status, json } as Partial<Response>;
  return { req, res };
}

describe('Auth Login', () => {
  test('should login with valid credentials', async () => {
    const controller = new AuthController();
    const { req, res } = mockReqRes({ username, password });
    const next = jest.fn();
    await controller.login(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonResponse = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonResponse.success).toBe(true);
    expect(jsonResponse.data.token).toBeDefined();
    expect(jsonResponse.data.user.username).toBe(username);
  });

  test('should reject invalid password', async () => {
    const controller = new AuthController();
    const { req, res } = mockReqRes({ username, password: 'wrongpassword' });
    const next = jest.fn();
    await controller.login(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  test('should reject missing fields', async () => {
    const controller = new AuthController();
    const { req, res } = mockReqRes({ username: '' });
    const next = jest.fn();
    await controller.login(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
  });

  test('should reject unknown username', async () => {
    const controller = new AuthController();
    const { req, res } = mockReqRes({ username: 'nonexistent_user_xyz', password: 'somePass' });
    const next = jest.fn();
    await controller.login(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  test('should reject inactive account', async () => {
    const password_hash = await hashPassword('inactivePass');
    const inactiveUser = `${prefix}${shortId()}`;
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'sub_warehouse_manager', false)`,
      [inactiveUser, password_hash, inactiveUser]
    );

    const controller = new AuthController();
    const { req, res } = mockReqRes({ username: inactiveUser, password: 'inactivePass' });
    const next = jest.fn();
    await controller.login(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  test('should reject login when the account holds a deactivated legacy role (storekeeper)', async () => {
    const legacyUser = `${prefix}${shortId()}`;
    const spy = jest
      .spyOn(usersRepository, 'findByUsername')
      .mockResolvedValue({
        id: 999999,
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

    const controller = new AuthController();
    const { req, res } = mockReqRes({ username: legacyUser, password: 'irrelevant' });
    const next = jest.fn();
    await controller.login(req as Request, res as Response, next);

    expect(spy).toHaveBeenCalledWith(legacyUser);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTH_ROLE_DISABLED');

    spy.mockRestore();
  });
});

describe('Auth Middleware', () => {
  function mockReqResWithHeaders(authHeader?: string): { req: Partial<Request>; res: Partial<Response> } {
    const json = jest.fn().mockReturnValue({});
    const status = jest.fn().mockReturnValue({ json });
    const req = { headers: {} } as Partial<Request>;
    if (authHeader) {
      req.headers = { authorization: authHeader };
    }
    const res = { status, json } as Partial<Response>;
    return { req, res };
  }

  test('should reject request without token', async () => {
    const { req, res } = mockReqResWithHeaders(undefined);
    const next = jest.fn();
    await authenticate(req as any, res as Response, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.message).toBe('Authentication required');
  });

  test('should reject request with malformed token', async () => {
    const { req, res } = mockReqResWithHeaders('Bearer invalidtoken123');
    const next = jest.fn();
    await authenticate(req as any, res as Response, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.message).toBe('Invalid or expired token');
  });

  test('should accept request with valid token', async () => {
    const token = generateToken({ userId, username, role: 'admin' });
    const { req, res } = mockReqResWithHeaders(`Bearer ${token}`);
    const next = jest.fn();
    await authenticate(req as any, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect((req as any).user).toBeDefined();
    expect((req as any).user.userId).toBe(userId);
  });
});
