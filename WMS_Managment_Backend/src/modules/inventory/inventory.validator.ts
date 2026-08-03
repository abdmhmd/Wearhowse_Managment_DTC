import { z } from 'zod';

export const openSessionSchema = z.object({
  warehouse_id: z.number({ message: 'warehouse_id is required' }).int().positive(),
  notes: z.string().optional(),
});

export const recordCountSchema = z.object({
  item_id: z.number({ message: 'item_id is required' }).int().positive(),
  counted_qty: z.number({ message: 'counted_qty is required' }).nonnegative('counted_qty must be greater than or equal to 0'),
  notes: z.string().optional(),
});
