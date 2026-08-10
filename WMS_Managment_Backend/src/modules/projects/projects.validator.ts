import { z } from 'zod';

export const studentSchema = z.object({
  full_name: z.string().min(1, 'Student name is required').max(255),
  student_id: z.string().max(50).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(500),
  department_id: z.number({ message: 'department_id is required' }).int().positive(),
  supervisor_id: z.number({ message: 'supervisor_id is required' }).int().positive(),
  warehouse_id: z.number().int().positive().optional(),
  academic_year: z.string().max(20).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  start_date: z.string().optional().nullable(),
  expected_completion_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  students: z.array(studentSchema).max(200).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  supervisor_id: z.number().int().positive().optional(),
  warehouse_id: z.number().int().positive().optional(),
  academic_year: z.string().max(20).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  start_date: z.string().optional().nullable(),
  expected_completion_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const setStudentsSchema = z.object({
  students: z.array(studentSchema).max(200),
});
