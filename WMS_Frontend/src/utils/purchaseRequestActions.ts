import type { PurchaseRequestPermission, PurchaseRequestStatus } from '@/types';

/**
 * Action visibility rules for purchase requests.
 *
 * Permission-based only — never role-based. Mirrors the backend guards:
 *   - cancel:        creator only, status = pending
 *   - approve-dept:  department manager, status = pending
 *   - reject-dept:   department manager, status = pending | dept_approved
 *   - approve-admin: admin, status = dept_approved
 *   - reject-admin:  admin, status = dept_approved
 */
export type PurchaseRequestAction =
  | 'cancel'
  | 'approveDept'
  | 'rejectDept'
  | 'approveAdmin'
  | 'rejectAdmin';

export interface PurchaseRequestVisibilityInput {
  permissions: PurchaseRequestPermission[];
  userId: number | null;
  createdBy: number;
  status: PurchaseRequestStatus;
}

export function getPurchaseRequestActions(input: PurchaseRequestVisibilityInput): PurchaseRequestAction[] {
  const { permissions, userId, createdBy, status } = input;
  const has = (p: PurchaseRequestPermission) => permissions.includes(p);
  const actions: PurchaseRequestAction[] = [];

  if (has('purchase-requests:cancel') && userId != null && userId === createdBy && status === 'pending') {
    actions.push('cancel');
  }
  if (has('purchase-requests:approve-dept') && status === 'pending') {
    actions.push('approveDept');
  }
  if (has('purchase-requests:reject-dept') && (status === 'pending' || status === 'dept_approved')) {
    actions.push('rejectDept');
  }
  if (has('purchase-requests:approve-admin') && status === 'dept_approved') {
    actions.push('approveAdmin');
  }
  if (has('purchase-requests:reject-admin') && status === 'dept_approved') {
    actions.push('rejectAdmin');
  }

  return actions;
}