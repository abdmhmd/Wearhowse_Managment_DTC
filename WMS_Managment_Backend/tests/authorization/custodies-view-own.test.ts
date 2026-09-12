import { pool } from '../../src/config/database';
import { PERMISSIONS } from '../../src/modules/authorization/permissions';

describe('custodies:view_own (phase 2: custody-holder roles only; admin lost it)', () => {
  it('is present in the backend permission catalog', () => {
    expect(PERMISSIONS.CUSTODIES_VIEW_OWN).toBe('custodies:view_own');
  });

  it('exists in the permissions table', async () => {
    const res = await pool.query(
      `SELECT id FROM permissions WHERE code = 'custodies:view_own'`
    );
    expect(res.rowCount).toBe(1);
  });

  it('is granted to supervisor and sub_warehouse_manager (admin lost view_own in phase 2)', async () => {
    const res = await pool.query(
      `SELECT r.code
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.code = 'custodies:view_own'
        ORDER BY r.code`
    );
    const codes = res.rows.map((row: { code: string }) => row.code);
    expect(codes).toEqual(
      expect.arrayContaining(['supervisor', 'sub_warehouse_manager'])
    );
    expect(codes).not.toContain('admin');
  });

  it('is NOT granted to department_manager (cannot create requests, never holds custodies)', async () => {
    const res = await pool.query(
      `SELECT 1
         FROM role_permissions
         JOIN roles r ON r.id = role_permissions.role_id
         JOIN permissions p ON p.id = role_permissions.permission_id
        WHERE p.code = 'custodies:view_own'
          AND r.code = 'department_manager'`
    );
    expect(res.rowCount).toBe(0);
  });
});