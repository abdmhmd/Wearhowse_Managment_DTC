import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import { sendSuccess } from '../../utils/response';
import { hashPassword } from '../../utils/crypto';
import { createUserSchema, updateUserSchema } from './users.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';

export class UsersController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await usersService.getAll(page, limit);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid user ID');
      const data = await usersService.getById(id);
      if (!data) throw new NotFoundError('User', 'USER_NOT_FOUND', { id: req.params.id });
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const password_hash = await hashPassword(parsed.data.password);
      const data = await usersService.create({ ...parsed.data, password_hash });
      sendSuccess(res, data, 201);
    } catch (e) { next(e); }
  }
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid user ID');

      // Build updateData safely — never spread raw password into the object
      const { password, ...restData } = parsed.data;
      const updateData: any = { ...restData };
      if (password) {
        updateData.password_hash = await hashPassword(password);
      }

      const data = await usersService.update(id, updateData);
      if (!data) throw new NotFoundError('User', 'USER_NOT_FOUND', { id });
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid user ID');
      const data = await usersService.delete(id);
      if (!data) throw new NotFoundError('User', 'USER_NOT_FOUND', { id: req.params.id });
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
}
export const usersController = new UsersController();
