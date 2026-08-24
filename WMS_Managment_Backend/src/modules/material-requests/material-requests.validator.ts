import { z } from 'zod';

const materialRequestItemSchema = z.object({
  item_id: z.number({ message: 'item_id is required' }).int().positive('item_id must be a positive integer'),
  quantity: z.number({ message: 'quantity is required' }).positive('quantity must be greater than 0'),
  // unit_code is OPTIONAL: the unit is a SERVER-DERIVED property of the item
  // (its base unit). Any client value is ignored by the service, which always
  // persists the item's authoritative base unit.
  unit_code: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const createMaterialRequestSchema = z
  .object({
    // department_id is OPTIONAL from the client: the service derives it from the
    // selected warehouse (warehouses.department_id) and rejects any client value
    // that contradicts it, so a hand-crafted payload cannot create a request
    // under an arbitrary department.
    department_id: z.number().int().positive().optional().nullable(),
    // warehouse_id is OPTIONAL at the schema level: users WITH warehouse
    // assignments never need it (the service auto-assigns and ignores any
    // payload value), and the zero-assignment fallback validates presence and
    // eligibility inside the service so it can return a specific message.
    warehouse_id: z.number({ message: 'warehouse_id is required' }).int().positive().optional().nullable(),
    request_type: z.enum(['experiment', 'semester', 'project']).optional().default('experiment'),
    project_id: z.number().int().positive().optional().nullable(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    needed_by: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const date = new Date(val);
          if (Number.isNaN(date.getTime())) return false;
          // Allow today (start of day) and any future date; block only past dates.
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          return date >= todayStart;
        },
        { message: 'needed_by must be today or a future date' }
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
