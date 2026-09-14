import { pool } from '../../src/config/database';
import { usersService } from '../../src/modules/users/users.service';
import { shortId, TEST_PREFIX, seedDepartment, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}user_test_`;

afterAll(async () => { await cleanup(prefix); });

describe('users CRUD', () => {
  let createdId: number;
  let deptId: number;

  test('create', async () => {
    deptId = await seedDepartment();
    const username = `${prefix}${shortId()}`;
    const result = await usersService.create({
      username,
      password_hash: 'dummy_hash',
      full_name: 'Test User',
      role: 'department_manager',
      department_id: deptId,
    });
    expect(result).toMatchObject({ username, full_name: 'Test User', role: 'department_manager', is_active: true });
    expect(result.id).toBeGreaterThan(0);
    createdId = result.id;
  });

  test('getAll', async () => {
    const { items } = await usersService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getById', async () => {
    const result = await usersService.getById(createdId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(createdId);
  });

  test('update', async () => {
    const result = await usersService.update(createdId, { full_name: 'Updated User' });
    expect(result).not.toBeNull();
    expect(result?.full_name).toBe('Updated User');
  });

  test('delete', async () => {
    const result = await usersService.delete(createdId);
    expect(result).not.toBeNull();
    const check = await usersService.getById(createdId);
    expect(check).toBeNull();
  });
});