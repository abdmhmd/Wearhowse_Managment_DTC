import { z } from 'zod';

export const createItemSchema = z.object({
  item_code: z.string().min(1, 'Item code is required').max(100),
  name_ar: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional().or(z.literal('')),
  category_code: z.string().min(1, 'Category is required'),
  unit_code: z.string().min(1, 'Unit is required'),
  warehouse_id: z.coerce.number().int().positive('Warehouse is required'),
  min_stock_level: z.coerce.number().nonnegative().optional().default(0),
  max_stock_level: z.coerce.number().nonnegative().optional().default(999999.9999),
  location: z.string().max(100).optional().or(z.literal('')),
});

export const updateItemSchema = z.object({
  item_code: z.string().min(1).max(100).optional(),
  name_ar: z.string().min(1).max(255).optional(),
  description: z.string().optional().or(z.literal('')),
  category_code: z.string().min(1).optional(),
  unit_code: z.string().min(1).optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
  min_stock_level: z.coerce.number().nonnegative().optional(),
  max_stock_level: z.coerce.number().nonnegative().optional(),
  location: z.string().max(100).optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

export type CreateItemFormData = z.infer<typeof createItemSchema>;
export type UpdateItemFormData = z.infer<typeof updateItemSchema>;
