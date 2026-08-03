import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import { sendSuccess } from '../../utils/response';
import { updateSettingsSchema } from './settings.validator';
import { ValidationError } from '../../utils/AppError';

export class SettingsController {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getAll();
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await settingsService.update(parsed.data as Record<string, string>);
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
}
export const settingsController = new SettingsController();
