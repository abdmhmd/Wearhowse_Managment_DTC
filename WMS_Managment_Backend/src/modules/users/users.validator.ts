import { z } from 'zod';

const userRoleEnum = z.enum(['system_admin', 'warehouse_manager', 'department_manager', 'supervisor']);

export const createUserSchema = z
  .object({
    username: z.string().min(1).max(100),
    password: z.string().min(6).max(255),
    full_name: z.string().min(1).max(255),
    role: userRoleEnum,
    department_id: z.number().int().positive().optional().nullable(),
    warehouse_ids: z.array(z.number().int().positive()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (
      (data.role === 'department_manager' || data.role === 'supervisor') &&
      (data.department_id === undefined || data.department_id === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'department_id is required for this role',
        path: ['department_id'],
      });
    }
    if (data.role === 'warehouse_manager' && (!data.warehouse_ids || data.warehouse_ids.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'warehouse_manager must be assigned at least one warehouse',
        path: ['warehouse_ids'],
      });
    }
  });

export const updateUserSchema = z
  .object({
    username: z.string().min(1).max(100).optional(),
    password: z.string().min(6).max(255).optional(),
    full_name: z.string().min(1).max(255).optional(),
    role: z.enum(['system_admin', 'warehouse_manager', 'department_manager', 'supervisor']).optional(),
    is_active: z.boolean().optional(),
    department_id: z.number().int().positive().optional().nullable(),
    warehouse_ids: z.array(z.number().int().positive()).optional(),
  })
  .superRefine((data, ctx) => {
    // On update we cannot be sure the caller is changing the role; only
    // validate warehouse assignments when the role is explicitly being set to
    // warehouse_manager in this request.
    if (data.role === 'warehouse_manager' && data.warehouse_ids !== undefined && data.warehouse_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'warehouse_manager must be assigned at least one warehouse',
        path: ['warehouse_ids'],
      });
    }
    if (
      (data.role === 'department_manager' || data.role === 'supervisor') &&
      data.department_id !== undefined && data.department_id === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'department_id is required for this role',
        path: ['department_id'],
      });
    }
  });
