import { z } from 'zod';

export const createWarehouseSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Name is required').max(255),
  location: z.string().max(255).optional().or(z.literal('')),
});

export const updateWarehouseSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50).optional(),
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
  location: z.string().max(255).optional().or(z.literal('')),
});

export type CreateWarehouseFormData = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseFormData = z.infer<typeof updateWarehouseSchema>;
