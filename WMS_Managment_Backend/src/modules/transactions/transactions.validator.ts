import { z } from 'zod';

const transactionTypeEnum = z.enum(['RV', 'LN']);

export const transactionHeaderSchema = z.object({
  transaction_no: z.string().min(1).max(100).optional(),
  type: transactionTypeEnum,
  supplier_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  warehouse_id: z.number().int().positive(),
  notes: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.type === 'LN' && (data.department_id === undefined || data.department_id === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Department is required for Issuing (LN) transactions',
      path: ['department_id'],
    });
  }
});

export const transactionDetailSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive(),
  unit_code: z.string().min(1).max(50),
  unit_price: z.number().nonnegative().optional().default(0),
});

export const createDraftSchema = z.object({
  header: transactionHeaderSchema,
  details: z.array(transactionDetailSchema).min(1),
});
