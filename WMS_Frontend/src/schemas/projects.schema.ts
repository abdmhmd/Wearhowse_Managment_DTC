import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(500),
  department_id: z.coerce.number().int().positive('Department is required'),
  supervisor_id: z.coerce.number().int().positive('Supervisor is required'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  supervisor_id: z.coerce.number().int().positive().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')).nullable(),
});

export type CreateProjectFormData = z.infer<typeof createProjectSchema>;
export type UpdateProjectFormData = z.infer<typeof updateProjectSchema>;
