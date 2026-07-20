import { z } from 'zod';

export const createDepartmentSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Name is required').max(255),
});

export const updateDepartmentSchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
});

export type CreateDepartmentFormData = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentFormData = z.infer<typeof updateDepartmentSchema>;
