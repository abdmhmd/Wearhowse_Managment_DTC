import { z } from 'zod';

const roleEnum = z.enum(['admin', 'sub_warehouse_manager', 'department_manager', 'supervisor']);

// The <select> placeholder submits an empty string; coerce numbers but treat
// an empty string as "not selected" so optional departments don't become 0.
const departmentId = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().positive().optional().nullable()
);

export const createUserSchema = z
  .object({
    username: z.string().min(1, 'Username is required').max(100),
    password: z.string().min(6, 'Password must be at least 6 characters').max(255),
    full_name: z.string().min(1, 'Full name is required').max(255),
    role: roleEnum,
    department_id: departmentId,
    warehouse_ids: z.array(z.number().int().positive()).default([]),
  })
  .superRefine((data, ctx) => {
    if (
      (data.role === 'department_manager' || data.role === 'supervisor') &&
      (data.department_id === undefined || data.department_id === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Department is required for this role',
        path: ['department_id'],
      });
    }
  });

export const updateUserSchema = z
  .object({
    username: z.string().min(1).max(100).optional(),
    password: z.string().min(6).max(255).optional().or(z.literal('')),
    full_name: z.string().min(1).max(255).optional(),
    role: roleEnum.optional(),
    is_active: z.boolean().optional(),
    department_id: departmentId,
    warehouse_ids: z.array(z.number().int().positive()).default([]),
  })
  .superRefine((data, ctx) => {
    if (
      (data.role === 'department_manager' || data.role === 'supervisor') &&
      data.department_id !== undefined &&
      data.department_id === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Department is required for this role',
        path: ['department_id'],
      });
    }
  });

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
