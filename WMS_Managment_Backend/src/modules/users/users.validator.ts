import { z } from 'zod';

const userRoleEnum = z.enum(['system_admin', 'warehouse_manager', 'storekeeper', 'accountant', 'department_manager', 'viewer']);

export const createUserSchema = z
  .object({
    username: z.string().min(1).max(100),
    password: z.string().min(6).max(255),
    full_name: z.string().min(1).max(255),
    role: userRoleEnum,
    department_id: z.number().int().positive().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'department_manager' && (data.department_id === undefined || data.department_id === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'department_id is required for department_manager role',
        path: ['department_id'],
      });
    }
  });

export const updateUserSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(255).optional(),
  full_name: z.string().min(1).max(255).optional(),
  role: userRoleEnum.optional(),
  is_active: z.boolean().optional(),
  department_id: z.number().int().positive().optional().nullable(),
});
