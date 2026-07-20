import { z } from 'zod';

export const createDepartmentSchema = z.object({
  code: z.string().min(1).max(50),
  name_ar: z.string().min(1).max(255),
});

export const updateDepartmentSchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
});
