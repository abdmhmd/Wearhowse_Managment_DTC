import { Request, Response, NextFunction } from 'express';
import { supervisorsService } from './supervisors.service';
import { sendData, sendPaginated } from '../../utils/response';
import { hashPassword } from '../../utils/crypto';
import { createSupervisorSchema, updateSupervisorSchema } from './supervisors.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { writeAudit } from '../authorization/audit.service';

export class SupervisorsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const { items, pagination } = await supervisorsService.getAll((req as any).user, page, limit, search);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid supervisor ID');
      const data = await supervisorsService.getById((req as any).user, id);
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createSupervisorSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const { password, ...rest } = parsed.data;
      const password_hash = await hashPassword(password);
      const data = await supervisorsService.create((req as any).user, { ...rest, password_hash });
      await writeAudit({
        user_id: (req as any).user?.userId ?? null,
        action: 'SUPERVISOR_CREATED',
        resource: 'supervisors',
        resource_id: data.id,
        details: { username: data.username, department_id: data.department_id },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, data, { statusCode: 201 });
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateSupervisorSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid supervisor ID');

      const { password, ...restData } = parsed.data;
      const updateData: any = { ...restData };
      if (password) {
        updateData.password_hash = await hashPassword(password);
      }

      const data = await supervisorsService.update((req as any).user, id, updateData);

      const details: Record<string, unknown> = {};
      if (updateData.is_active !== undefined) details.is_active = updateData.is_active;
      if (updateData.password_hash !== undefined) details.password_changed = true;
      await writeAudit({
        user_id: (req as any).user?.userId ?? null,
        action: updateData.is_active !== undefined ? 'SUPERVISOR_STATUS_CHANGED' : 'SUPERVISOR_UPDATED',
        resource: 'supervisors',
        resource_id: id,
        details,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid supervisor ID');
      const data = await supervisorsService.remove((req as any).user, id);
      await writeAudit({
        user_id: (req as any).user?.userId ?? null,
        action: 'SUPERVISOR_DELETED',
        resource: 'supervisors',
        resource_id: id,
        details: { username: data.username },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, data);
    } catch (e) { next(e); }
  }
}

export const supervisorsController = new SupervisorsController();
