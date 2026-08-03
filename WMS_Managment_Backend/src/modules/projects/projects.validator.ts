import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(500),
  department_id: z.number({ message: 'department_id is required' }).int().positive(),
  supervisor_id: z.number({ message: 'supervisor_id is required' }).int().positive(),
  notes: z.string().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  supervisor_id: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional().nullable(),
});
