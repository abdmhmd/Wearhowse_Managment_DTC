import { z } from 'zod';

const poLineSchema = z.object({
  item_id: z.number({ message: 'item_id is required' }).int().positive('item_id must be a positive integer'),
  quantity_ordered: z
    .number({ message: 'quantity_ordered is required' })
    .positive('quantity_ordered must be greater than 0'),
  unit_code: z.string().min(1).max(50),
  unit_price: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const createPurchaseOrderSchema = z
  .object({
    // department_id is NEVER accepted from the client — the service derives it
    // from the receiving warehouse. Stripped here so a forged value cannot pass.
    department_id: z.undefined().optional(),
    supplier_id: z.number().int().positive().optional().nullable(),
    // warehouse_id is OPTIONAL at the schema level: warehouse managers never
    // send it (the backend derives their department main warehouse), while
    // system_admin must provide it — enforced in the service per role.
    warehouse_id: z.number().int().positive().optional().nullable(),
    order_date: z.string().nullable().optional(),
    // nullable: clients may send explicit nulls for absent optionals
    // (e.g. the WM creation form sends `notes: null`).
    expected_date: z
      .string()
      .nullable()
      .optional()
      .refine((val) => {
        if (!val) return true;
        const d = new Date(val);
        return !Number.isNaN(d.getTime());
      }, { message: 'expected_date must be a valid date' }),
    notes: z.string().max(1000).nullable().optional(),
    lines: z.array(poLineSchema).min(1, 'A purchase order must contain at least one item line'),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<number>();
    data.lines.forEach((line, index) => {
      if (seen.has(line.item_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'item_id'],
          message: `Duplicate item line for item_id ${line.item_id}`,
        });
      }
      seen.add(line.item_id);
    });
  });

const poLinePartialSchema = z.object({
  item_id: z.number({ message: 'item_id is required' }).int().positive('item_id must be a positive integer'),
  quantity_ordered: z
    .number({ message: 'quantity_ordered is required' })
    .positive('quantity_ordered must be greater than 0'),
  unit_code: z.string().min(1).max(50),
  unit_price: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

// Standalone schema (NOT derived via .partial() — zod forbids .partial() on
// schemas carrying superRefine refinements).
export const updatePurchaseOrderSchema = z
  .object({
    department_id: z.undefined().optional(),
    supplier_id: z.number().int().positive().optional().nullable(),
    warehouse_id: z.number().int().positive().optional(),
    order_date: z.string().nullable().optional(),
    expected_date: z
      .string()
      .nullable()
      .optional()
      .refine((val) => {
        if (!val) return true;
        const d = new Date(val);
        return !Number.isNaN(d.getTime());
      }, { message: 'expected_date must be a valid date' }),
    notes: z.string().max(1000).nullable().optional(),
    lines: z.array(poLinePartialSchema).min(1, 'A purchase order must contain at least one item line').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines) {
      const seen = new Set<number>();
      data.lines.forEach((line, index) => {
        if (seen.has(line.item_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'item_id'],
            message: `Duplicate item line for item_id ${line.item_id}`,
          });
        }
        seen.add(line.item_id);
      });
    }
  });

export const receivePoSchema = z.object({
  lines: z
    .array(
      z.object({
        detail_id: z.number({ message: 'detail_id is required' }).int().positive(),
        quantity: z.number({ message: 'quantity is required' }).positive('quantity must be greater than 0'),
        unit_price: z.number().min(0).optional(),
        batch_number: z.string().max(100).optional(),
      })
    )
    .min(1, 'Receiving requires at least one line')
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();
      lines.forEach((line, index) => {
        if (seen.has(line.detail_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'detail_id'],
            message: `Duplicate detail_id ${line.detail_id} in receive payload`,
          });
        }
        seen.add(line.detail_id);
      });
    }),
});

export const allocatePoSchema = z.object({
  detail_id: z.number({ message: 'detail_id is required' }).int().positive(),
  dest_warehouse_id: z.number({ message: 'dest_warehouse_id is required' }).int().positive(),
  quantity: z.number({ message: 'quantity is required' }).positive('quantity must be greater than 0'),
});

export const transferAllocationSchema = z.object({
  quantity: z.number({ message: 'quantity is required' }).positive('quantity must be greater than 0'),
});
