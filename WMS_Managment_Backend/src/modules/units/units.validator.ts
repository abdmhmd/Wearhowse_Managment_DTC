import { z } from 'zod';

export const createUnitSchema = z.object({
  code: z.string().min(1).max(50),
  name_ar: z.string().min(1).max(255),
  name_en: z.string().min(1).max(255),
});

export const updateUnitSchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  name_en: z.string().min(1).max(255).optional(),
});
