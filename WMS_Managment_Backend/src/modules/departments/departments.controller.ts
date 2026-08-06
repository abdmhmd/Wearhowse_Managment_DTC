import { Request, Response, NextFunction } from 'express';
import { departmentsService } from './departments.service';
import { sendData, sendPaginated } from '../../utils/response';
import { createDepartmentSchema, updateDepartmentSchema } from './departments.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';

export class DepartmentsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await departmentsService.getAll(page, limit);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }
  async getByCode(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await departmentsService.getByCode(req.params.code);
      if (!data) throw new NotFoundError('Department', 'DEPARTMENT_NOT_FOUND', { code: req.params.code });
      sendData(res, data);
    } catch (e) { next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createDepartmentSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await departmentsService.create(parsed.data);
      sendData(res, data, { statusCode: 201 });
    } catch (e) { next(e); }
  }
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateDepartmentSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await departmentsService.update(req.params.code, parsed.data);
      if (!data) throw new NotFoundError('Department', 'DEPARTMENT_NOT_FOUND', { code: req.params.code });
      sendData(res, data);
    } catch (e) { next(e); }
  }
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await departmentsService.delete(req.params.code);
      if (!data) throw new NotFoundError('Department', 'DEPARTMENT_NOT_FOUND', { code: req.params.code });
      sendData(res, data);
    } catch (e) { next(e); }
  }
}
export const departmentsController = new DepartmentsController();
