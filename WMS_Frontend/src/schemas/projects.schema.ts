import { z } from 'zod';

export const studentSchema = z.object({
  full_name: z.string().min(1, 'Student name is required').max(255),
  student_id: z.string().max(50).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(500),
  department_id: z.coerce.number().int().positive('Department is required'),
  supervisor_id: z.coerce.number().int().positive('Supervisor is required'),
  warehouse_id: z.coerce.number().int().positive().optional(),
  academic_year: z.string().max(20).optional().or(z.literal('')).nullable(),
  description: z.string().max(4000).optional().or(z.literal('')).nullable(),
  notes: z.string().max(2000).optional().or(z.literal('')).nullable(),
  students: z.array(studentSchema).max(200).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  supervisor_id: z.coerce.number().int().positive().optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
  academic_year: z.string().max(20).optional().or(z.literal('')).nullable(),
  description: z.string().max(4000).optional().or(z.literal('')).nullable(),
  notes: z.string().max(2000).optional().or(z.literal('')).nullable(),
});

export type CreateProjectFormData = z.infer<typeof createProjectSchema>;
export type UpdateProjectFormData = z.infer<typeof updateProjectSchema>;
