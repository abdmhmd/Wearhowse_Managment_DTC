import { stockMovementsRepository } from './stock-movements.repository';
import { PaginationMeta } from '../../utils/response';
import type { AuthUserContext } from '../authorization/authorization.service';

export class StockMovementsService {
  async getAll(page = 1, limit = 20, user?: AuthUserContext): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      stockMovementsRepository.findAll(limit, offset, user),
      stockMovementsRepository.countAll(user),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getByItemId(item_id: number, page = 1, limit = 20, user?: AuthUserContext): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      stockMovementsRepository.findByItemId(item_id, limit, offset, user),
      stockMovementsRepository.countByItemId(item_id, user),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getByTransactionId(transaction_id: number, page = 1, limit = 20, user?: AuthUserContext): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      stockMovementsRepository.findByTransactionId(transaction_id, limit, offset, user),
      stockMovementsRepository.countByTransactionId(transaction_id, user),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
export const stockMovementsService = new StockMovementsService();
