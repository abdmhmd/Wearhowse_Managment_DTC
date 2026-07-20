import { z } from 'zod';

export const createSupplierSchema = z.object({
  name_ar: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional(),
  address: z.string().optional(),
});

export const updateSupplierSchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional(),
  address: z.string().optional(),
});
