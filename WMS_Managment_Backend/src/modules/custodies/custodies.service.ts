import { runInTransaction } from '../../config/database';
import { custodiesRepository, CustodyStatus } from './custodies.repository';
import { transactionsService } from '../transactions/transactions.service';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { PaginationMeta } from '../../utils/response';

export class CustodiesService {
  async getAll(filters: {
    status?: CustodyStatus;
    assigned_to?: number;
    project_id?: number;
    warehouse_id?: number;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await custodiesRepository.findAll({
      status: filters.status,
      assigned_to: filters.assigned_to,
      project_id: filters.project_id,
      warehouse_id: filters.warehouse_id,
      limit,
      offset,
    });

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number) {
    const custody = await custodiesRepository.findById(id);
    if (!custody) throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
    return custody;
  }

  /**
   * Return a durable item: creates + approves an RTI (Return To Inventory)
   * transaction, then marks the custody record as returned.
   */
  async returnItem(id: number, returnedBy: number, notes?: string) {
    return runInTransaction(async (client) => {
      const custody = await custodiesRepository.findById(id);
      if (!custody) throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });

      if (custody.status !== 'active') {
        throw new ValidationError('Custody is already returned', { id, status: custody.status });
      }

      const transaction = await transactionsService.createDraft(
        {
          type: 'RTI',
          warehouse_id: custody.warehouse_id,
          department_id: null,
          created_by: returnedBy,
          notes: `Return to inventory from custody #${id}${notes ? ` - ${notes}` : ''}`,
        },
        [
          {
            item_id: custody.item_id,
            quantity: custody.quantity,
            unit_code: custody.unit_code,
            unit_price: 0,
          },
        ],
        client
      );

      const txnId = transaction.id!;
      await transactionsService.approveTransaction(txnId, returnedBy, client);

      await custodiesRepository.markReturned(client, id, txnId, notes);

      return { message: 'Item returned successfully', transaction_id: txnId, transaction_no: transaction.transaction_no };
    });
  }
}

export const custodiesService = new CustodiesService();
