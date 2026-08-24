import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { purchaseOrdersService } from './purchase-orders.service';
import { sendData, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePoSchema,
  allocatePoSchema,
  transferAllocationSchema,
} from './purchase-orders.validator';
import { writeAudit } from '../authorization/audit.service';

export class PurchaseOrdersController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, supplier_id, warehouse_id, search, page, limit } = req.query;
      const result = await purchaseOrdersService.getAll(
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
        {
          status: status as string,
          supplier_id: supplier_id ? Number(supplier_id) : undefined,
          warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
          search: search as string,
        },
        req.user
      );
      sendPaginated(res, result.items, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const result = await purchaseOrdersService.getById(id, req.user);
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createPurchaseOrderSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      // department_id / created_by / status are NEVER taken from the payload.
      const result = await purchaseOrdersService.create(parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_CREATED',
        resource: 'purchase_orders',
        resource_id: result.id,
        details: { po_number: result.po_number, warehouse_id: parsed.data.warehouse_id },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { statusCode: 201, message: 'Purchase order created successfully' });
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const parsed = updatePurchaseOrderSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await purchaseOrdersService.update(id, parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_UPDATED',
        resource: 'purchase_orders',
        resource_id: id,
        details: { fields: Object.keys(parsed.data) },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'Purchase order updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const result = await purchaseOrdersService.approve(id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_APPROVED',
        resource: 'purchase_orders',
        resource_id: id,
        details: { po_number: result.po_number },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'Purchase order approved successfully' });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const reason = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
      const result = await purchaseOrdersService.cancel(id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_CANCELLED',
        resource: 'purchase_orders',
        resource_id: id,
        details: { reason: reason ?? null, po_number: result.po_number },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'Purchase order cancelled successfully' });
    } catch (err) {
      next(err);
    }
  }

  async close(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const result = await purchaseOrdersService.close(id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_CLOSED',
        resource: 'purchase_orders',
        resource_id: id,
        details: { po_number: result.po_number },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'Purchase order closed successfully' });
    } catch (err) {
      next(err);
    }
  }

  async receive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const parsed = receivePoSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await purchaseOrdersService.receive(id, parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_RECEIVED',
        resource: 'purchase_orders',
        resource_id: id,
        details: { lines: parsed.data.lines, transaction_id: result.transaction_id },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'Stock received successfully' });
    } catch (err) {
      next(err);
    }
  }

  async allocate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid purchase order ID');
      const parsed = allocatePoSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await purchaseOrdersService.allocate(id, parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_ALLOCATED',
        resource: 'purchase_order_allocations',
        resource_id: result.id,
        details: { po_id: id, detail_id: parsed.data.detail_id, dest_warehouse_id: parsed.data.dest_warehouse_id, quantity: parsed.data.quantity },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { statusCode: 201, message: 'Stock allocated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async transfer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const allocationId = Number(req.params.id);
      if (isNaN(allocationId)) throw new ValidationError('Invalid allocation ID');
      const parsed = transferAllocationSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await purchaseOrdersService.transferAllocation(allocationId, parsed.data.quantity, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PO_TRANSFERRED',
        resource: 'purchase_order_allocations',
        resource_id: allocationId,
        details: { quantity: parsed.data.quantity, transaction_id: result.transaction_id },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'Stock transferred successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const purchaseOrdersController = new PurchaseOrdersController();
