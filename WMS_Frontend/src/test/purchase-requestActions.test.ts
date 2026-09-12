import { describe, it, expect } from 'vitest';
import { getPurchaseRequestActions, type PurchaseRequestAction } from '@/utils/purchaseRequestActions';
import type { PurchaseRequestPermission, PurchaseRequestStatus } from '@/types';

const allPerms: PurchaseRequestPermission[] = [
  'purchase-requests:view',
  'purchase-requests:view_own',
  'purchase-requests:create',
  'purchase-requests:cancel',
  'purchase-requests:approve-dept',
  'purchase-requests:reject-dept',
  'purchase-requests:approve-admin',
  'purchase-requests:reject-admin',
];

const deptPerms: PurchaseRequestPermission[] = ['purchase-requests:view_own', 'purchase-requests:approve-dept', 'purchase-requests:reject-dept'];
const adminPerms: PurchaseRequestPermission[] = ['purchase-requests:view', 'purchase-requests:approve-admin', 'purchase-requests:reject-admin', 'purchase-requests:cancel'];

function get(overrides: {
  permissions?: PurchaseRequestPermission[];
  userId?: number | null;
  createdBy: number;
  status: PurchaseRequestStatus;
}): PurchaseRequestAction[] {
  return getPurchaseRequestActions({
    permissions: overrides.permissions ?? allPerms,
    userId: overrides.userId ?? 1,
    createdBy: overrides.createdBy,
    status: overrides.status,
  });
}

describe('getPurchaseRequestActions', () => {
  // ── cancel ────────────────────────────────────────────────────────────────
  it('shows cancel for the creator when pending', () => {
    const a = get({ permissions: allPerms, userId: 5, createdBy: 5, status: 'pending' });
    expect(a).toContain('cancel');
  });

  it('hides cancel for a different user', () => {
    const a = get({ permissions: allPerms, userId: 1, createdBy: 99, status: 'pending' });
    expect(a).not.toContain('cancel');
  });

  it('hides cancel when status is not pending', () => {
    const a = get({ permissions: allPerms, userId: 1, createdBy: 1, status: 'dept_approved' });
    expect(a).not.toContain('cancel');
  });

  it('hides cancel when permission is missing', () => {
    const a = get({ permissions: deptPerms, userId: 1, createdBy: 1, status: 'pending' });
    expect(a).not.toContain('cancel');
  });

  // ── approve-dept ──────────────────────────────────────────────────────────
  it('shows approve-dept when permission present and pending', () => {
    const a = get({ permissions: deptPerms, userId: 1, createdBy: 99, status: 'pending' });
    expect(a).toContain('approveDept');
  });

  it('hides approve-dept when status is not pending', () => {
    const a = get({ permissions: deptPerms, userId: 1, createdBy: 99, status: 'dept_approved' });
    expect(a).not.toContain('approveDept');
  });

  // ── reject-dept ───────────────────────────────────────────────────────────
  it('shows reject-dept for both pending and dept_approved', () => {
    expect(get({ permissions: deptPerms, userId: 1, createdBy: 99, status: 'pending' })).toContain('rejectDept');
    expect(get({ permissions: deptPerms, userId: 1, createdBy: 99, status: 'dept_approved' })).toContain('rejectDept');
  });

  it('hides reject-dept for other statuses', () => {
    expect(get({ permissions: deptPerms, userId: 1, createdBy: 99, status: 'admin_approved' })).not.toContain('rejectDept');
    expect(get({ permissions: deptPerms, userId: 1, createdBy: 99, status: 'rejected' })).not.toContain('rejectDept');
  });

  // ── approve-admin ─────────────────────────────────────────────────────────
  it('shows approve-admin only for dept_approved', () => {
    expect(get({ permissions: adminPerms, userId: 1, createdBy: 99, status: 'dept_approved' })).toContain('approveAdmin');
    expect(get({ permissions: adminPerms, userId: 1, createdBy: 99, status: 'pending' })).not.toContain('approveAdmin');
  });

  // ── reject-admin ──────────────────────────────────────────────────────────
  it('shows reject-admin only for dept_approved', () => {
    expect(get({ permissions: adminPerms, userId: 1, createdBy: 99, status: 'dept_approved' })).toContain('rejectAdmin');
    expect(get({ permissions: adminPerms, userId: 1, createdBy: 99, status: 'admin_approved' })).not.toContain('rejectAdmin');
  });

  // ── composite scenarios ───────────────────────────────────────────────────
  it('department manager on pending request gets approve-dept + reject-dept (not cancel)', () => {
    const a = get({ permissions: deptPerms, userId: 1, createdBy: 2, status: 'pending' });
    expect(a).toContain('approveDept');
    expect(a).toContain('rejectDept');
    expect(a).not.toContain('cancel');
  });

  it('admin on dept_approved request gets approve-admin + reject-admin', () => {
    const a = get({ permissions: adminPerms, userId: 1, createdBy: 99, status: 'dept_approved' });
    expect(a).toContain('approveAdmin');
    expect(a).toContain('rejectAdmin');
  });

  it('no permissions returns empty', () => {
    const a = get({ permissions: [], userId: 1, createdBy: 1, status: 'pending' });
    expect(a).toEqual([]);
  });
});