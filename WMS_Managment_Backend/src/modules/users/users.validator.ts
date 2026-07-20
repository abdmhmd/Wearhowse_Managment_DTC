import { z } from 'zod';

const userRoleEnum = z.enum(['system_admin', 'warehouse_manager', 'storekeeper', 'accountant']);

export const createUserSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(6).max(255),
  full_name: z.string().min(1).max(255),
  role: userRoleEnum,
});

export const updateUserSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(255).optional(),
  full_name: z.string().min(1).max(255).optional(),
  role: userRoleEnum.optional(),
  is_active: z.boolean().optional(),
});
