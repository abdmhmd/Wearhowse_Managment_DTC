import { z } from 'zod';

export const createSupervisorSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters').max(255),
  full_name: z.string().min(1, 'Full name is required').max(255),
  is_active: z.boolean().default(true),
  department_id: z.coerce.number().int().positive().optional().nullable(),
});

export const updateSupervisorSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(255).optional().or(z.literal('')),
  full_name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
});

export type CreateSupervisorFormData = z.infer<typeof createSupervisorSchema>;
export type UpdateSupervisorFormData = z.infer<typeof updateSupervisorSchema>;
