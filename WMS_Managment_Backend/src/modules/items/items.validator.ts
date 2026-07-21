import { z } from 'zod';

export const createItemSchema = z.object({
  item_code: z.string().min(1).max(100).optional(),
  name_ar: z.string().min(1).max(255),
  description: z.string().optional(),
  category_code: z.string().min(1).max(50),
  unit_code: z.string().min(1).max(50),
  warehouse_id: z.number().int().positive(),
  min_stock_level: z.number().nonnegative().optional(),
  max_stock_level: z.number().nonnegative().optional(),
  current_balance: z.number().nonnegative().optional(),
  location: z.string().max(100).optional(),
});

export const updateItemSchema = z.object({
  item_code: z.string().min(1).max(100).optional(),
  name_ar: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category_code: z.string().min(1).max(50).optional(),
  unit_code: z.string().min(1).max(50).optional(),
  warehouse_id: z.number().int().positive().optional(),
  min_stock_level: z.number().nonnegative().optional(),
  max_stock_level: z.number().nonnegative().optional(),
  current_balance: z.number().nonnegative().optional(),
  location: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
});
