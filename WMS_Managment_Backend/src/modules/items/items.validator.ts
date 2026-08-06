import { z } from 'zod';

export const createItemSchema = z.object({
  name_ar: z.string().min(1).max(255),
  description: z.string().optional(),
  category_code: z.string().min(1).max(50),
  subcategory_id: z.number().int().positive().optional().nullable(),
  unit_code: z.string().min(1).max(50),
  warehouse_id: z.number().int().positive(),
  min_stock_level: z.number().nonnegative().optional(),
  max_stock_level: z.number().nonnegative().optional(),
  current_balance: z.number().nonnegative().optional(),
  opening_price: z.number().nonnegative().optional().default(0),
  location: z.string().max(100).optional(),
  is_consumable: z.boolean().optional().default(true),
  expiry_alert_days: z.number().int().min(1).max(3650).optional().default(30),
  sap_material_number: z.string().max(100).optional().nullable(),
  gl_account: z.string().max(100).optional().nullable(),
});

export const updateItemSchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category_code: z.string().min(1).max(50).optional(),
  subcategory_id: z.number().int().positive().optional().nullable(),
  unit_code: z.string().min(1).max(50).optional(),
  warehouse_id: z.number().int().positive().optional(),
  min_stock_level: z.number().nonnegative().optional(),
  max_stock_level: z.number().nonnegative().optional(),
  current_balance: z.number().nonnegative().optional(),
  opening_price: z.number().nonnegative().optional(),
  location: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
  is_consumable: z.boolean().optional(),
  expiry_alert_days: z.number().int().min(1).max(3650).optional(),
  sap_material_number: z.string().max(100).optional().nullable(),
  gl_account: z.string().max(100).optional().nullable(),
});
