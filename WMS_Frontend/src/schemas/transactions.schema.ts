import { z } from 'zod';

export const transactionTypeEnum = z.enum(['RV', 'LN']);

export const transactionHeaderSchema = z.object({
  type: transactionTypeEnum,
  supplier_id: z.coerce.number().int().positive().optional().nullable(),
  department_id: z.coerce.number().int().positive().optional().nullable(),
  warehouse_id: z.coerce.number().int().positive('Warehouse is required'),
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
  item_id: z.coerce.number().int().positive('Item is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unit_code: z.string().min(1, 'Unit is required'),
  unit_price: z.coerce.number().nonnegative().optional().default(0),
  unit_cost: z.coerce.number().nonnegative().optional(),
  total_value: z.coerce.number().nonnegative().optional(),
  batch_number: z.string().max(100).optional().nullable(),
  expiry_tracking_enabled: z.boolean().optional().default(false),
  production_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.expiry_tracking_enabled && !data.expiry_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expiry date is required when expiry tracking is enabled',
      path: ['expiry_date'],
    });
  }
  if (data.production_date && data.expiry_date && data.production_date > data.expiry_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Production date must not be later than expiry date',
      path: ['production_date'],
    });
  }
});

export const createDraftTransactionSchema = z.object({
  header: transactionHeaderSchema,
  details: z.array(transactionDetailSchema).min(1, 'At least one line item is required'),
});

export const createDraftTransactionFormSchema = z.object({
  header: transactionHeaderSchema,
});

export type TransactionHeaderFormData = z.infer<typeof transactionHeaderSchema>;
export type TransactionDetailFormData = z.infer<typeof transactionDetailSchema>;
export type CreateDraftTransactionFormData = z.infer<typeof createDraftTransactionSchema>;
export type CreateDraftTransactionFormFormData = z.infer<typeof createDraftTransactionFormSchema>;
