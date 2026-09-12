export type PurchaseRequestStatus =
  | 'pending'
  | 'dept_approved'
  | 'admin_approved'
  | 'rejected'
  | 'cancelled';

/**
 * Valid purchase-request status transitions (server-authoritative).
 * `rejected` and `cancelled` are terminal.
 */
export const PR_STATUS_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  pending: ['dept_approved', 'rejected', 'cancelled'],
  dept_approved: ['admin_approved', 'rejected'],
  admin_approved: [],
  rejected: [],
  cancelled: [],
};

export function prCanTransition(from: PurchaseRequestStatus, to: PurchaseRequestStatus): boolean {
  return PR_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}