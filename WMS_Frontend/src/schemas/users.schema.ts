import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters').max(255),
  full_name: z.string().min(1, 'Full name is required').max(255),
  role: z.enum(['system_admin', 'warehouse_manager', 'storekeeper', 'accountant'], {
    required_error: 'Role is required',
  }),
});

export const updateUserSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(255).optional().or(z.literal('')),
  full_name: z.string().min(1).max(255).optional(),
  role: z.enum(['system_admin', 'warehouse_manager', 'storekeeper', 'accountant']).optional(),
  is_active: z.boolean().optional(),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
