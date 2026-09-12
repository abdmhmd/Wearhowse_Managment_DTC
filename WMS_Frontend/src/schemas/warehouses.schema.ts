import { z } from 'zod';

export const departmentIdField = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable().default(null)
);

export const createWarehouseSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Name is required').max(255),
  location: z.string().max(255).optional().or(z.literal('')),
  department_id: departmentIdField,
  is_main: z.boolean().optional(),
});

export const updateWarehouseSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50).optional(),
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
  location: z.string().max(255).optional().or(z.literal('')),
  department_id: departmentIdField,
  is_main: z.boolean().optional(),
});

export type CreateWarehouseFormData = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseFormData = z.infer<typeof updateWarehouseSchema>;