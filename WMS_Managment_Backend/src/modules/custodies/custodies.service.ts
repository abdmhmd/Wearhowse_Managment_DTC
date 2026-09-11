import { runInTransaction, pool } from '../../config/database';
import { custodiesRepository, CustodyStatus, CustodyCondition } from './custodies.repository';
import { transactionsService } from '../transactions/transactions.service';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { PaginationMeta } from '../../utils/response';
import { scopeForUser, type DataScope } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

async function custodyInScope(
  custody: { warehouse_id: number; project_id?: number | null; assigned_to: number },
  user: AuthUserContext
): Promise<boolean> {
  const scope: DataScope = scopeForUser(user);
  if (scope === 'GLOBAL') return true;
  if (scope === 'WAREHOUSE') return user.warehouse_ids.includes(custody.warehouse_id);
  if (scope === 'DEPARTMENT' && user.department_id != null) {
    if (custody.project_id != null) {
      const res = await pool.query(
        'SELECT department_id FROM projects WHERE id = $1',
        [custody.project_id]
      );
      if (res.rows[0]?.department_id === user.department_id) return true;
    }
    const assigned = await pool.query(
      'SELECT department_id FROM users WHERE id = $1',
      [custody.assigned_to]
    );
    return assigned.rows[0]?.department_id === user.department_id;
  }
  // NONE scope: user can only see custodies assigned to them directly
  if (user.id) {
    return custody.assigned_to === user.id;
  }
  return false;
}

export interface ReturnCustodyOptions {
  notes?: string | null;
  condition?: CustodyCondition;
  /** Quantity returned in good condition (defaults to the full custody quantity). */
  returned_quantity?: number;
}

export class CustodiesService {
  async getAll(filters: {
    status?: CustodyStatus;
    assigned_to?: number;
    project_id?: number;
    warehouse_id?: number;
    page?: number;
    limit?: number;
    user?: AuthUserContext;
  }): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await custodiesRepository.findAll({
      status: filters.status,
      assigned_to: filters.assigned_to,
      project_id: filters.project_id,
      warehouse_id: filters.warehouse_id,
      user: filters.user,
      limit,
      offset,
    });

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number, user?: AuthUserContext) {
    const custody = await custodiesRepository.findById(id);
    if (!custody) throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
    if (user && !await custodyInScope(custody, user)) {
      throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
    }
    return custody;
  }

  /**
   * Return a borrowed/assigned material.
   *
   * For supervisors (NONE scope): initiates a return request, setting the
   * custody status to 'return_pending'. The warehouse manager must then
   * confirm receipt via `receiveReturn` before stock is restored.
   *
   * For warehouse managers / admins: immediate return (existing behavior).
   * - condition 'good' (default): an RTI (Return To Inventory) transaction is
   *   created + approved, restoring the returned quantity to inventory. A full
   *   return closes the custody; a partial one keeps it active with the
   *   remaining quantity still outstanding.
   * - condition 'damaged' | 'lost': NO stock is restored. The custody record is
   *   preserved with the matching status + condition so the material is never
   *   silently returned to the available balance.
   *
   * Backwards compatible: `optsOrNotes` may be a plain string (the legacy
   * callers treat it as notes).
   */
  async returnItem(
    id: number,
    returnedBy: number,
    optsOrNotes?: string | ReturnCustodyOptions | null,
    user?: AuthUserContext
  ) {
    const opts: ReturnCustodyOptions =
      typeof optsOrNotes === 'string' ? { notes: optsOrNotes } : (optsOrNotes ?? {});

    const condition = opts.condition ?? 'good';
    if (!['good', 'damaged', 'lost'].includes(condition)) {
      throw new ValidationError('Invalid return condition', { condition });
    }

    return runInTransaction(async (client) => {
      const custody = await custodiesRepository.findById(id);
      if (!custody) throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
      if (user && !(await custodyInScope(custody, user))) {
        throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
      }

      if (custody.status !== 'active') {
        throw new ValidationError('Custody is already returned', { id, status: custody.status });
      }

      const borrowedQty = Number(custody.quantity) || 0;
      const returnedQty =
        opts.returned_quantity != null ? Number(opts.returned_quantity) : borrowedQty;
      if (!isFinite(returnedQty) || returnedQty <= 0) {
        throw new ValidationError('Returned quantity must be a positive number', { id });
      }
      if (returnedQty > borrowedQty) {
        throw new ValidationError(
          `Cannot return more than the borrowed quantity (${borrowedQty})`,
          { id, borrowed: borrowedQty, returned: returnedQty }
        );
      }

      // Supervisor / department_manager (NONE scope): request return instead
      // of immediately restoring stock. The warehouse manager confirms.
      if (user) {
        const scope: DataScope = scopeForUser(user);
        if (scope === 'NONE' && user.id) {
          await client.query(
            `UPDATE custodies
               SET status = 'return_pending',
                   pending_return_quantity = $1,
                   return_notes = $2,
                   updated_at = NOW()
             WHERE id = $3`,
            [returnedQty, opts.notes ?? null, id]
          );
          return {
            message: 'Return request submitted; awaiting warehouse manager confirmation',
            custody_id: id,
            pending_return_quantity: returnedQty,
          };
        }
      }

      // Damaged / lost: no stock restoration; preserve the record.
      if (condition !== 'good') {
        await custodiesRepository.markUnrestored(client, id, condition, opts.notes ?? null);
        return {
          message: `Material marked as ${condition}`,
          status: condition,
          custody_id: id,
        };
      }

      // Good condition: restore the returned quantity through the RTI workflow.
      // The RTI is credited to the item's PRIMARY warehouse (items.warehouse_id)
      // so items.current_balance is updated; crediting the custody warehouse
      // would only touch a per-warehouse row and leave the balance unchanged.
      const home = await client.query('SELECT warehouse_id FROM items WHERE id = $1', [custody.item_id]);
      const rtiWarehouseId = home.rows[0]?.warehouse_id ?? custody.warehouse_id;
      const transaction = await transactionsService.createDraft(
        {
          type: 'RTI',
          warehouse_id: rtiWarehouseId,
          department_id: null,
          created_by: returnedBy,
          notes: `Return to inventory from custody #${id}${opts.notes ? ` - ${opts.notes}` : ''}`,
        },
        [
          {
            item_id: custody.item_id,
            quantity: returnedQty,
            unit_code: custody.unit_code,
            unit_price: 0,
          },
        ],
        client
      );

      const txnId = transaction.id!;
      await transactionsService.approveTransaction(txnId, returnedBy, client);

      if (returnedQty < borrowedQty) {
        // Partial return: keep the custody active with the remaining quantity.
        await custodiesRepository.reduceQuantity(client, id, returnedQty, txnId, opts.notes ?? null);
        return {
          message: 'Partial return recorded; remaining quantity still outstanding',
          transaction_id: txnId,
          transaction_no: transaction.transaction_no,
          custody_id: id,
        };
      }

      await custodiesRepository.markReturned(client, id, txnId, opts.notes ?? null);
      return {
        message: 'Item returned successfully',
        transaction_id: txnId,
        transaction_no: transaction.transaction_no,
      };
    });
  }

  /**
   * Warehouse manager confirms receipt of a return_pending custody.
   * Creates the RTI transaction and restores stock.
   */
  async receiveReturn(
    id: number,
    receivedBy: number,
    user?: AuthUserContext
  ) {
    return runInTransaction(async (client) => {
      const custody = await custodiesRepository.findById(id);
      if (!custody) throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
      if (user && !(await custodyInScope(custody, user))) {
        throw new NotFoundError('Custody', 'CUSTODY_NOT_FOUND', { id });
      }

      if (custody.status !== 'return_pending') {
        throw new ValidationError(
          `Cannot receive a custody with status '${custody.status}'. It must be 'return_pending'.`,
          { id, status: custody.status }
        );
      }

      const borrowedQty = Number(custody.quantity) || 0;
      const pendingQty = Number(custody.pending_return_quantity) || borrowedQty;
      const condition = custody.condition ?? 'good';

      // Damaged / lost: no stock restoration; preserve the record.
      if (condition !== 'good') {
        await custodiesRepository.markUnrestored(client, id, condition, custody.return_notes ?? null);
        return {
          message: `Material received as ${condition}`,
          status: condition,
          custody_id: id,
        };
      }

      // Good condition: restore the returned quantity through the RTI workflow.
      // Credit the item's PRIMARY warehouse so items.current_balance moves.
      const home = await client.query('SELECT warehouse_id FROM items WHERE id = $1', [custody.item_id]);
      const rtiWarehouseId = home.rows[0]?.warehouse_id ?? custody.warehouse_id;
      const transaction = await transactionsService.createDraft(
        {
          type: 'RTI',
          warehouse_id: rtiWarehouseId,
          department_id: null,
          created_by: receivedBy,
          notes: `Return to inventory from custody #${id}${custody.return_notes ? ` - ${custody.return_notes}` : ''}`,
        },
        [
          {
            item_id: custody.item_id,
            quantity: pendingQty,
            unit_code: custody.unit_code,
            unit_price: 0,
          },
        ],
        client
      );

      const txnId = transaction.id!;
      await transactionsService.approveTransaction(txnId, receivedBy, client);

      if (pendingQty < borrowedQty) {
        await custodiesRepository.reduceQuantity(client, id, pendingQty, txnId, custody.return_notes ?? null);
        return {
          message: 'Partial return confirmed; remaining quantity still outstanding',
          transaction_id: txnId,
          transaction_no: transaction.transaction_no,
          custody_id: id,
        };
      }

      await custodiesRepository.markReturned(client, id, txnId, custody.return_notes ?? null);
      return {
        message: 'Return confirmed and stock restored',
        transaction_id: txnId,
        transaction_no: transaction.transaction_no,
      };
    });
  }
}

export const custodiesService = new CustodiesService();
