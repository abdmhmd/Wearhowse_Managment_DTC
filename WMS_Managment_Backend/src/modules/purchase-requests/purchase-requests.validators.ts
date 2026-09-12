import { z } from 'zod';

const purchaseRequestItemSchema = z.object({
  item_id: z.number({ message: 'item_id is required' }).int().positive('item_id must be a positive integer'),
  quantity: z.number({ message: 'quantity is required' }).positive('quantity must be greater than 0'),
  // unit_code is required on purchase requests: the buyer records the unit the
  // item is requested in (the auto-PO copies it verbatim into
  // purchase_order_details).
  unit_code: z.string({ message: 'unit_code is required' }).min(1).max(50),
  notes: z.string().max(500).optional(),
});

export const createPurchaseRequestSchema = z.object({
  // warehouse_id is the department's ACTIVE MAIN warehouse (validated in the
  // service); the auto-PO receives into it so the PO main-warehouse trigger
  // passes.
  warehouse_id: z.number({ message: 'warehouse_id is required' }).int().positive('warehouse_id must be a positive integer'),
  notes: z.string().max(1000).optional(),
  items: z
    .array(purchaseRequestItemSchema)
    .min(1, 'At least one item is required')
    .max(200, 'Cannot exceed 200 items per request'),
});

export const rejectPurchaseRequestSchema = z.object({
  reason: z.string({ message: 'reason is required' }).min(1, 'Rejection reason is required').max(500),
});