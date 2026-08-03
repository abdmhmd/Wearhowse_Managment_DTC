import { z } from 'zod';

const transactionTypeEnum = z.enum(['RV', 'LN', 'RTV', 'RTI', 'ADJ', 'TRF']);

export const transactionHeaderSchema = z.object({
  transaction_no: z.string().min(1).max(100).optional(),
  type: transactionTypeEnum,
  supplier_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  warehouse_id: z.number().int().positive(),
  to_warehouse_id: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.type === 'LN' && (data.department_id === undefined || data.department_id === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Department is required for Issuing (LN) transactions',
      path: ['department_id'],
    });
  }
  if (data.type === 'TRF' && (data.to_warehouse_id === undefined || data.to_warehouse_id === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Destination warehouse is required for Transfer (TRF) transactions',
      path: ['to_warehouse_id'],
    });
  }
  if (data.type === 'TRF' && data.to_warehouse_id === data.warehouse_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Source and destination warehouses must be different',
      path: ['to_warehouse_id'],
    });
  }
});

export const transactionDetailSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive(),
  unit_code: z.string().min(1).max(50),
  unit_price: z.number().nonnegative().optional().default(0),
  unit_cost: z.number().nonnegative().optional(),
  total_value: z.number().nonnegative().optional(),
  batch_number: z.string().max(100).optional().nullable(),
});

export const createDraftSchema = z.object({
  header: transactionHeaderSchema,
  details: z
    .array(transactionDetailSchema)
    .min(1, 'At least one item detail is required')
    .max(500, 'Cannot exceed 500 items per transaction'),
});
