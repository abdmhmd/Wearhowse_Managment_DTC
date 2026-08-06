import { z } from 'zod';

export const createCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name_ar: z.string().min(1).max(255),
  name_en: z.string().max(255).optional(),
  prefix: z.string().max(10).optional(),
  parent_code: z.string().max(50).optional().nullable(),
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  name_en: z.string().max(255).optional(),
  prefix: z.string().max(10).optional(),
  parent_code: z.string().max(50).optional().nullable(),
  description: z.string().optional(),
});

export const createSubcategorySchema = z.object({
  code: z.string().min(1).max(50),
  name_ar: z.string().min(1).max(255),
  name_en: z.string().max(255).optional(),
  description: z.string().optional(),
});

export const updateSubcategorySchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  name_en: z.string().max(255).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});
