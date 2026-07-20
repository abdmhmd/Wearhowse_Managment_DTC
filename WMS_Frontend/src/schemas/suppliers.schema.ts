import { z } from 'zod';

export const createSupplierSchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(50).optional().or(z.literal('')),
  email: z.string().email('Invalid email').max(255).optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
});

export const updateSupplierSchema = z.object({
  name_ar: z.string().min(1, 'Name is required').max(255).optional(),
  phone: z.string().max(50).optional().or(z.literal('')),
  email: z.string().email('Invalid email').max(255).optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
});

export type CreateSupplierFormData = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierFormData = z.infer<typeof updateSupplierSchema>;
