import { z } from 'zod';

export const inventoryReportQuerySchema = z.object({
  warehouse_id: z.coerce.number().int().positive().optional(),
  category_code: z.string().min(1).max(50).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  low_stock: z.enum(['true']).optional(),
  overstock: z.enum(['true']).optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const itemCardParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
