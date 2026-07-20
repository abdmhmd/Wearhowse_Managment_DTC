import { z } from 'zod';

export const createWarehouseSchema = z.object({
  code: z.string().min(1).max(50),
  name_ar: z.string().min(1).max(255),
  location: z.string().max(255).optional(),
});

export const updateWarehouseSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name_ar: z.string().min(1).max(255).optional(),
  location: z.string().max(255).optional(),
});
