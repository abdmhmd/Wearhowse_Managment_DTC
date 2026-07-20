import { z } from 'zod';

export const createCategorySchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
  description: z.string().optional(),
});

export type CreateCategoryFormData = z.infer<typeof createCategorySchema>;
export type UpdateCategoryFormData = z.infer<typeof updateCategorySchema>;
