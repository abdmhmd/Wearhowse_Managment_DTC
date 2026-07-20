import { z } from 'zod';

export const createUnitConversionSchema = z.object({
  item_id: z.coerce.number().int().positive('Item is required'),
  from_unit_code: z.string().min(1, 'From unit is required'),
  to_unit_code: z.string().min(1, 'To unit is required'),
  factor: z.coerce.number().positive('Factor must be positive'),
});

export const updateUnitConversionSchema = z.object({
  from_unit_code: z.string().min(1).optional(),
  to_unit_code: z.string().min(1).optional(),
  factor: z.coerce.number().positive().optional(),
});

export type CreateUnitConversionFormData = z.infer<typeof createUnitConversionSchema>;
export type UpdateUnitConversionFormData = z.infer<typeof updateUnitConversionSchema>;
