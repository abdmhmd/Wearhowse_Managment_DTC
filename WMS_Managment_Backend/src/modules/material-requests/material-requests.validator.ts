import { z } from 'zod';

const materialRequestItemSchema = z.object({
  item_id: z.number({ message: 'item_id is required' }).int().positive('item_id must be a positive integer'),
  quantity: z.number({ message: 'quantity is required' }).positive('quantity must be greater than 0'),
  unit_code: z.string().min(1).max(50),
  notes: z.string().max(500).optional(),
});

export const createMaterialRequestSchema = z
  .object({
    department_id: z.number({ message: 'department_id is required' }).int().positive(),
    warehouse_id: z.number({ message: 'warehouse_id is required' }).int().positive(),
    request_type: z.enum(['experiment', 'semester', 'project']).optional().default('experiment'),
    project_id: z.number().int().positive().optional().nullable(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    needed_by: z
      .string()
      .optional()
      .refine(
        (val) => !val || new Date(val) > new Date(),
        { message: 'needed_by must be a future date' }
      ),
    notes: z.string().max(1000).optional(),
    items: z
      .array(materialRequestItemSchema)
      .min(1, 'At least one item is required')
      .max(200, 'Cannot exceed 200 items per request'),
  })
  .superRefine((data, ctx) => {
    if (data.request_type === 'project' && (data.project_id === undefined || data.project_id === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'project_id is required for project requests',
        path: ['project_id'],
      });
    }
  });

export const rejectRequestSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});
