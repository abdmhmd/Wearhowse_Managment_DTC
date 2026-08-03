import { z } from 'zod';

export const createItemSchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional().or(z.literal('')),
  category_code: z.string().min(1, 'Category is required'),
  unit_code: z.string().min(1, 'Unit is required'),
  warehouse_id: z.coerce.number().int().positive('Warehouse is required'),
  min_stock_level: z.coerce.number().nonnegative().optional().default(0),
  max_stock_level: z.coerce.number().nonnegative().optional().default(999999.9999),
  opening_price: z.coerce.number().nonnegative().optional().default(0),
  location: z.string().max(100).optional().or(z.literal('')),
  is_consumable: z.boolean().optional().default(true),
  expiry_alert_days: z.coerce.number().int().min(1, 'Alert days must be at least 1').max(3650, 'Alert days cannot exceed 3650').optional().default(30),
  sap_material_number: z.string().max(100).optional().or(z.literal('')),
  gl_account: z.string().max(100).optional().or(z.literal('')),
});

export const updateItemSchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  description: z.string().optional().or(z.literal('')),
  category_code: z.string().min(1).optional(),
  unit_code: z.string().min(1).optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
  min_stock_level: z.coerce.number().nonnegative().optional(),
  max_stock_level: z.coerce.number().nonnegative().optional(),
  opening_price: z.coerce.number().nonnegative().optional(),
  location: z.string().max(100).optional().or(z.literal('')),
  is_active: z.boolean().optional(),
  is_consumable: z.boolean().optional(),
  expiry_alert_days: z.coerce.number().int().min(1).max(3650).optional(),
  sap_material_number: z.string().max(100).optional().or(z.literal('')),
  gl_account: z.string().max(100).optional().or(z.literal('')),
});

export type CreateItemFormData = z.infer<typeof createItemSchema>;
export type UpdateItemFormData = z.infer<typeof updateItemSchema>;
