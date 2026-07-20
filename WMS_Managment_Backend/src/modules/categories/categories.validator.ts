import { z } from 'zod';

export const createCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name_ar: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});
