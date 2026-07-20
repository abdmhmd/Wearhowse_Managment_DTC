import { z } from 'zod';

export const createUnitConversionSchema = z.object({
  item_id: z.number().int().positive(),
  from_unit_code: z.string().min(1).max(50),
  to_unit_code: z.string().min(1).max(50),
  factor: z.number().positive(),
});

export const updateUnitConversionSchema = z.object({
  from_unit_code: z.string().min(1).max(50).optional(),
  to_unit_code: z.string().min(1).max(50).optional(),
  factor: z.number().positive().optional(),
});
