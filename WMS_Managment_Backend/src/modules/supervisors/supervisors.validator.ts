import { z } from 'zod';

export const createSupervisorSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(6).max(255),
  full_name: z.string().min(1).max(255),
  is_active: z.boolean().optional().default(true),
  department_id: z.number().int().positive().optional().nullable(),
});

// role / department_id are intentionally NOT present: a supervisor is by
// definition a user with role `supervisor` (set by the repository) and the
// department is resolved from the actor (department_manager) or from the
// payload (admin only). Zod's default object parsing strips unknown
// keys, so a client cannot smuggle `role` / `department_id` through an
// update request.
export const updateSupervisorSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(6).max(255).optional(),
  full_name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
});
