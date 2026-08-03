import { z } from 'zod';

export const updateSettingsSchema = z.object({
  inventory_account: z.string().min(1).max(100).optional(),
  supplier_account: z.string().min(1).max(100).optional(),
  expense_account_prefix: z.string().max(50).optional(),
  valuation_method: z.enum(['last_purchase', 'average', 'fifo']).optional(),
});
