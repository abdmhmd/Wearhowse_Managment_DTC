import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { projectsService } from './projects.service';
import { sendData, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { createProjectSchema, updateProjectSchema, setStudentsSchema } from './projects.validator';
import { writeAudit } from '../authorization/audit.service';

export class ProjectsController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await projectsService.create(req.user!.id, parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PROJECT_CREATED',
        resource: 'projects',
        resource_id: result.id,
        details: { name: result.name, department_id: result.department_id, warehouse_id: result.warehouse_id },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { statusCode: 201, message: 'تم إنشاء المشروع بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, department_id, warehouse_id, supervisor_id, academic_year, search, page, limit } = req.query;

      const result = await projectsService.getAll({
        status: status as any,
        department_id: department_id ? Number(department_id) : undefined,
        warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
        supervisor_id: supervisor_id ? Number(supervisor_id) : undefined,
        academic_year: academic_year ? String(academic_year) : undefined,
        search: search ? String(search) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        user: req.user,
      });

      sendPaginated(res, result.items, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.getById(id, req.user);
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  }

  /** Full detail: base row + students + borrowed materials. */
  async getDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.getDetail(id, req.user);
      sendData(res, result);
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
      const result = await projectsService.update(id, parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PROJECT_UPDATED',
        resource: 'projects',
        resource_id: id,
        details: { changes: Object.keys(parsed.data) },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم تحديث المشروع بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async close(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.close(id, req.user!.id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PROJECT_CLOSED',
        resource: 'projects',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم إغلاق المشروع بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.cancel(id, req.user!.id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PROJECT_CANCELLED',
        resource: 'projects',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم إلغاء المشروع بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /:id/students — replace the roster (free-text, not system users). */
  async setStudents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const parsed = setStudentsSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const students = await projectsService.setStudents(id, parsed.data.students, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PROJECT_STUDENTS_UPDATED',
        resource: 'projects',
        resource_id: id,
        details: { count: students.length },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, { students }, { message: 'تم تحديث قائمة الطلاب' });
    } catch (err) {
      next(err);
    }
  }

  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid project ID');
      const result = await projectsService.remove(id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PROJECT_DELETED',
        resource: 'projects',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم حذف المشروع' });
    } catch (err) {
      next(err);
    }
  }
}

export const projectsController = new ProjectsController();
