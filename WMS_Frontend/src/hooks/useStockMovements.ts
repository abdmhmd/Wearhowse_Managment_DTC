import { useQuery } from '@tanstack/react-query';
import { stockMovementsApi } from '@/api/stock-movements.api';

export function useStockMovements(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['stock-movements', page, limit],
    queryFn: async () => {
      const res = await stockMovementsApi.getAll(page, limit);
      return res.data;
    },
  });
}

export function useStockMovementsByItem(itemId: number, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['stock-movements', 'item', itemId, page, limit],
    queryFn: async () => {
      const res = await stockMovementsApi.getByItemId(itemId, page, limit);
      return res.data;
    },
    enabled: !!itemId,
  });
}

export function useStockMovementsByTransaction(transactionId: number, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['stock-movements', 'transaction', transactionId, page, limit],
    queryFn: async () => {
      const res = await stockMovementsApi.getByTransactionId(transactionId, page, limit);
      return res.data;
    },
    enabled: !!transactionId,
  });
}
