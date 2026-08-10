import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { projectsController } from './projects.controller';

const router = Router();

router.use(authenticate);

// GET /api/projects — list projects
router.get(
  '/',
  authorize('projects:view'),
  projectsController.getAll.bind(projectsController)
);

// GET /api/projects/:id
router.get(
  '/:id',
  authorize('projects:view'),
  projectsController.getById.bind(projectsController)
);

// GET /api/projects/:id/detail — full detail incl. students + borrowed materials
router.get(
  '/:id/detail',
  authorize('projects:view'),
  projectsController.getDetail.bind(projectsController)
);

// POST /api/projects — create project (warehouse/management or teacher)
router.post(
  '/',
  authorize('projects:create'),
  projectsController.create.bind(projectsController)
);

// PATCH /api/projects/:id — update project details
router.patch(
  '/:id',
  authorize('projects:update'),
  projectsController.update.bind(projectsController)
);

// PATCH /api/projects/:id/close — close project (blocks when active custodies exist)
router.patch(
  '/:id/close',
  authorize('projects:close'),
  projectsController.close.bind(projectsController)
);

// PATCH /api/projects/:id/cancel — cancel an open project
router.patch(
  '/:id/cancel',
  authorize('projects:close'),
  projectsController.cancel.bind(projectsController)
);

// PUT /api/projects/:id/students — replace the free-text student roster
router.put(
  '/:id/students',
  authorize('projects:update'),
  projectsController.setStudents.bind(projectsController)
);

// DELETE /api/projects/:id — soft delete
router.delete(
  '/:id',
  authorize('projects:delete'),
  projectsController.remove.bind(projectsController)
);

export default router;
