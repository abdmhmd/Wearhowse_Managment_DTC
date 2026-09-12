export type PurchaseOrderStatus =
  | 'draft'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

/** Statuses in which a PO can still receive stock. */
export const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = ['approved', 'partially_received'];

/**
 * Valid PO status transitions (server-authoritative).
 * `cancelled` and `closed` are terminal.
 */
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: ['closed'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}
