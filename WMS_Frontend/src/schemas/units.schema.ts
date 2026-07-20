import { z } from 'zod';

export const createUnitSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name_ar: z.string().min(1, 'Arabic name is required').max(255),
  name_en: z.string().min(1, 'English name is required').max(255),
});

export const updateUnitSchema = z.object({
  name_ar: z.string().min(1, 'Arabic name is required').max(255).optional(),
  name_en: z.string().min(1, 'English name is required').max(255).optional(),
});

export type CreateUnitFormData = z.infer<typeof createUnitSchema>;
export type UpdateUnitFormData = z.infer<typeof updateUnitSchema>;
