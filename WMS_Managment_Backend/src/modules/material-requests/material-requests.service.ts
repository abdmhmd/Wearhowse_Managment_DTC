import { runInTransaction } from '../../config/database';
import { materialRequestsRepository, MaterialRequestDetail, RequestType } from './material-requests.repository';
import { transactionsService } from '../transactions/transactions.service';
import { custodiesRepository } from '../custodies/custodies.repository';
import { NotFoundError, ValidationError, AppError } from '../../utils/AppError';

export class MaterialRequestsService {

  async createRequest(
    requestedBy: number,
    data: {
      department_id: number;
      warehouse_id: number;
      request_type?: RequestType;
      project_id?: number | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      needed_by?: string;
      notes?: string;
      items: Array<{ item_id: number; quantity: number; unit_code: string; notes?: string }>;
    }
  ) {
    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Request must have at least one item', {});
    }

    return runInTransaction(async (client) => {
      const request_no = await materialRequestsRepository.generateRequestNo();

      const header = await materialRequestsRepository.create(client, {
        request_no,
        department_id: data.department_id,
        warehouse_id: data.warehouse_id,
        requested_by: requestedBy,
        status: 'pending',
        priority: data.priority ?? 'normal',
        request_type: data.request_type ?? 'experiment',
        project_id: data.project_id ?? null,
        needed_by: data.needed_by ? new Date(data.needed_by) : null,
        notes: data.notes ?? null,
      });

      const details = [];
      for (const item of data.items) {
        const detail = await materialRequestsRepository.createDetail(client, {
          request_id: header.id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_code: item.unit_code,
          notes: item.notes ?? null,
        });
        details.push(detail);
      }

      return { ...header, details };
    });
  }

  async getById(id: number) {
    const header = await materialRequestsRepository.findById(id);
    if (!header) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id });
    const details = await materialRequestsRepository.findDetailsByRequestId(id);
    return { ...header, details };
  }

  async getAll(filters: {
    status?: string;
    department_id?: number;
    warehouse_id?: number;
    requested_by?: number;
    request_type?: RequestType;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await materialRequestsRepository.findAll({
      status: filters.status as any,
      department_id: filters.department_id,
      warehouse_id: filters.warehouse_id,
      requested_by: filters.requested_by,
      request_type: filters.request_type,
      limit,
      offset,
    });

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async approveRequest(requestId: number, approvedBy: number) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findById(requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });

      if (request.status !== 'pending') {
        throw new ValidationError(`Cannot approve a request with status '${request.status}'`, { status: request.status });
      }

      return materialRequestsRepository.updateStatus(client, requestId, 'approved', { approved_by: approvedBy });
    });
  }

  async rejectRequest(requestId: number, rejectedBy: number, reason: string) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findById(requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });

      if (request.status !== 'pending') {
        throw new ValidationError(`Cannot reject a request with status '${request.status}'`, { status: request.status });
      }

      return materialRequestsRepository.updateStatus(client, requestId, 'rejected', {
        rejection_reason: reason,
      });
    });
  }

  async issueRequest(requestId: number, issuedBy: number) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findById(requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });

      if (request.status !== 'approved') {
        throw new ValidationError(
          `Cannot issue a request with status '${request.status}'. Must be approved first.`,
          { status: request.status }
        );
      }

      const details = await materialRequestsRepository.findDetailsByRequestId(requestId);

      // Create a real LN (Issue Note) transaction from the request
      const transaction = await transactionsService.createDraft(
        {
          type: 'LN',
          department_id: request.department_id,
          warehouse_id: request.warehouse_id,
          created_by: issuedBy,
          notes: `Auto-generated from Request ${request.request_no}`,
        },
        details.map((d: any) => ({
          item_id: d.item_id,
          quantity: d.quantity,
          unit_code: d.unit_code,
          unit_price: 0,
          batch_number: null,
        })),
        client
      );

      // Immediately approve the LN transaction
      const txnId = transaction.id!;
      await transactionsService.approveTransaction(txnId, issuedBy, client);

      // Create custody records for non-consumable (durable) items
      for (const d of details as any[]) {
        if (d.is_consumable === false) {
          await custodiesRepository.create(client, {
            item_id: d.item_id,
            warehouse_id: request.warehouse_id,
            assigned_to: request.requested_by,
            quantity: d.quantity,
            unit_code: d.unit_code,
            issued_transaction_id: txnId,
            request_id: requestId,
            project_id: request.project_id,
            notes: `Auto-generated custody from Request ${request.request_no}`,
          });
        }
      }

      // Update request status to issued
      await materialRequestsRepository.updateStatus(client, requestId, 'issued', {
        issued_by: issuedBy,
        transaction_id: txnId,
      });

      return { message: 'Request issued successfully', transaction_id: txnId };
    });
  }

  async cancelRequest(requestId: number, cancelledBy: number, cancellerRole?: string) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findById(requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });

      if (!['pending', 'approved'].includes(request.status)) {
        throw new ValidationError(`Cannot cancel a request with status '${request.status}'`, { status: request.status });
      }

      // Ownership check: only the original requester or management can cancel
      const isManagement = cancellerRole && ['system_admin', 'warehouse_manager'].includes(cancellerRole);
      if (!isManagement && request.requested_by !== cancelledBy) {
        throw new AppError('You are not authorized to cancel this request', 403, 'AUTH_FORBIDDEN');
      }

      return materialRequestsRepository.updateStatus(client, requestId, 'cancelled');
    });
  }
}

export const materialRequestsService = new MaterialRequestsService();
