import { pool } from '../../src/config/database';
import { scopeForUser, isWarehouseFallbackUser } from '../../src/modules/authorization/scope';
import { ACTIVE_ROLES } from '../../src/modules/users/users.repository';
import { createUserSchema, updateUserSchema } from '../../src/modules/users/users.validator';

const NEW_ROLES = ['admin', 'sub_warehouse_manager', 'department_manager', 'supervisor'];
const LEGACY_ROLES = ['system_admin', 'warehouse_manager', 'storekeeper', 'accountant', 'viewer'];

// Minimal AuthUserContext factory (only the fields scopeForUser reads).
function ctx(role: string, department_id: number | null = null, warehouse_ids: number[] = []) {
  return {
    id: 1,
    userId: 1,
    username: 'u',
    full_name: 'U',
    role,
    department_id,
    department_name_ar: null,
    department_name_en: null,
    is_active: true,
    token_version: 1,
    permissions: [],
    warehouses: [],
    warehouse_ids,
  } as any;
}

describe('Role model rename (migration 038)', () => {
  test('AC R1: user_role enum contains exactly the 4 new labels', async () => {
    const res = await pool.query(
      `SELECT e.enumlabel
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role'
        ORDER BY e.enumsortorder`
    );
    expect(res.rows.map((r: any) => r.enumlabel)).toEqual(NEW_ROLES);
  });

  test('AC R2: ACTIVE_ROLES is exactly the 4 new role codes', () => {
    expect([...ACTIVE_ROLES].sort()).toEqual([...NEW_ROLES].sort());
    expect(ACTIVE_ROLES).toHaveLength(4);
  });

  test.each(LEGACY_ROLES)('AC R3: createUserSchema rejects legacy role "%s"', (role) => {
    const parsed = createUserSchema.safeParse({
      username: 'u',
      password: 'pass123',
      full_name: 'U',
      role,
    });
    expect(parsed.success).toBe(false);
  });

  test('AC R4: createUserSchema accepts the new role codes', () => {
    expect(createUserSchema.safeParse({ username: 'a', password: 'pass123', full_name: 'A', role: 'admin' }).success).toBe(true);
    expect(
      createUserSchema.safeParse({ username: 's', password: 'pass123', full_name: 'S', role: 'sub_warehouse_manager', warehouse_ids: [1] }).success
    ).toBe(true);
    expect(
      createUserSchema.safeParse({ username: 'd', password: 'pass123', full_name: 'D', role: 'department_manager', department_id: 1 }).success
    ).toBe(true);
    expect(
      createUserSchema.safeParse({ username: 'v', password: 'pass123', full_name: 'V', role: 'supervisor', department_id: 1 }).success
    ).toBe(true);
  });

  test('AC R5: updateUserSchema rejects legacy role values', () => {
    expect(updateUserSchema.safeParse({ role: 'storekeeper' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: 'system_admin' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: 'admin' }).success).toBe(true);
  });

  test('AC R6: no user holds a legacy role; if migration notes exist, token_version was bumped', async () => {
    const legacy = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users WHERE role::text IN ('system_admin','warehouse_manager','storekeeper','accountant','viewer')`
    );
    expect(legacy.rows[0].n).toBe(0);

    const res = await pool.query(
      `SELECT n.payload->>'username' AS username,
              n.payload->>'old_role' AS old_role,
              u.token_version AS token_version
         FROM _migration_notes n
         JOIN users u ON u.id = (n.payload->>'user_id')::bigint
        WHERE n.note_key = 'role_rename'`
    );
    if (res.rows.length > 0) {
      for (const r of res.rows) {
        expect(r.token_version).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('AC S1: scopeForUser resolves per the new role model', () => {
    expect(scopeForUser(ctx('admin'))).toBe('GLOBAL');

    expect(scopeForUser(ctx('department_manager', 5))).toBe('DEPARTMENT');
    expect(scopeForUser(ctx('department_manager'))).toBe('NONE');

    expect(scopeForUser(ctx('sub_warehouse_manager', 5, []))).toBe('DEPARTMENT');
    expect(scopeForUser(ctx('sub_warehouse_manager', null, [7]))).toBe('WAREHOUSE');
    expect(scopeForUser(ctx('sub_warehouse_manager'))).toBe('NONE');

    expect(scopeForUser(ctx('supervisor', 5))).toBe('NONE');
    expect(scopeForUser(ctx('storekeeper'))).toBe('NONE');
    expect(scopeForUser(ctx('accountant'))).toBe('NONE');
    expect(scopeForUser(ctx('viewer'))).toBe('NONE');
  });

  test('AC S2: isWarehouseFallbackUser matches only zero-assignment sub_warehouse_manager', () => {
    expect(isWarehouseFallbackUser(ctx('sub_warehouse_manager'))).toBe(true);
    expect(isWarehouseFallbackUser(ctx('sub_warehouse_manager', null, [7]))).toBe(false);
    expect(isWarehouseFallbackUser(ctx('sub_warehouse_manager', 5, []))).toBe(true);
    expect(isWarehouseFallbackUser(ctx('admin'))).toBe(false);
  });
});