import { z } from 'zod';

const optionalString = z
  .string()
  .max(255)
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const optionalCode = z
  .string()
  .max(50)
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v));

export const createCategorySchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Name is required').max(255),
  name_en: optionalString,
  parent_code: optionalCode,
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
  name_en: optionalString,
  parent_code: optionalCode,
  description: z.string().optional(),
});

export const createSubcategorySchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Name is required').max(255),
  name_en: optionalString,
  description: z.string().optional(),
});

export const updateSubcategorySchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
  name_en: optionalString,
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

export type CreateCategoryFormData = z.infer<typeof createCategorySchema>;
export type UpdateCategoryFormData = z.infer<typeof updateCategorySchema>;
export type CreateSubcategoryFormData = z.infer<typeof createSubcategorySchema>;
export type UpdateSubcategoryFormData = z.infer<typeof updateSubcategorySchema>;
