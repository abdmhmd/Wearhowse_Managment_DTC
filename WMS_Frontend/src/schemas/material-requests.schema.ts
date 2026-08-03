import { z } from 'zod';

export const materialRequestItemSchema = z.object({
  item_id: z.coerce.number().int().positive('Item is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unit_code: z.string().min(1, 'Unit is required'),
  notes: z.string().optional().or(z.literal('')),
});

export const createMaterialRequestSchema = z
  .object({
    department_id: z.coerce.number().int().positive('Department is required'),
    warehouse_id: z.coerce.number().int().positive('Warehouse is required'),
    request_type: z.enum(['experiment', 'semester', 'project']).optional().default('experiment'),
    project_id: z.coerce.number().int().positive().optional().or(z.literal('')),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    needed_by: z.string().optional().or(z.literal('')),
    notes: z.string().max(1000).optional().or(z.literal('')),
    items: z.array(materialRequestItemSchema).min(1, 'At least one item is required'),
  })
  .superRefine((data, ctx) => {
    if (data.request_type === 'project' && !data.project_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project is required for project requests',
        path: ['project_id'],
      });
    }
  });

export type CreateMaterialRequestFormData = z.infer<typeof createMaterialRequestSchema>;
