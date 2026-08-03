import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { projectsService } from './projects.service';
import { sendSuccess } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { createProjectSchema, updateProjectSchema } from './projects.validator';

export class ProjectsController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await projectsService.create(req.user!.id, parsed.data);
      sendSuccess(res, result, 'تم إنشاء المشروع بنجاح', 201);
    } catch (err) {
      next(err);
    }
  }

  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, department_id, supervisor_id, page, limit } = req.query;

      const result = await projectsService.getAll({
        status: status as any,
        department_id: department_id ? Number(department_id) : undefined,
        supervisor_id: supervisor_id ? Number(supervisor_id) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.getById(id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const result = await projectsService.update(id, parsed.data);
      sendSuccess(res, result, 'تم تحديث المشروع بنجاح');
    } catch (err) {
      next(err);
    }
  }

  async close(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.close(id, req.user!.id);
      sendSuccess(res, result, 'تم إغلاق المشروع بنجاح');
    } catch (err) {
      next(err);
    }
  }

  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.remove(id);
      sendSuccess(res, result, 'تم حذف المشروع');
    } catch (err) {
      next(err);
    }
  }
}

export const projectsController = new ProjectsController();
