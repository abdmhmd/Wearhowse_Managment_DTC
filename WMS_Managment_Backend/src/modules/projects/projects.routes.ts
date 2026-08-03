import { Router } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { projectsController } from './projects.controller';

const router = Router();

router.use(authenticate);

// GET /api/projects — list projects
router.get(
  '/',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager', 'accountant', 'viewer']),
  projectsController.getAll.bind(projectsController)
);

// GET /api/projects/:id
router.get(
  '/:id',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager', 'accountant', 'viewer']),
  projectsController.getById.bind(projectsController)
);

// POST /api/projects — create project (warehouse/management or teacher)
router.post(
  '/',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager']),
  projectsController.create.bind(projectsController)
);

// PATCH /api/projects/:id — update project details
router.patch(
  '/:id',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager']),
  projectsController.update.bind(projectsController)
);

// PATCH /api/projects/:id/close — close project (blocks when active custodies exist)
router.patch(
  '/:id/close',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager']),
  projectsController.close.bind(projectsController)
);

// DELETE /api/projects/:id — soft delete
router.delete(
  '/:id',
  authorize([...ROLES.ADMINS_ONLY]),
  projectsController.remove.bind(projectsController)
);

export default router;
