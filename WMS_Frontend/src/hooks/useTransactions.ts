import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi, type TransactionHeaderInput, type TransactionDetailInput } from '@/api/transactions.api';
import { showSuccess, showError } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/utils/error';

export function useTransactions(page = 1, limit = 20, type?: string, status?: string) {
  return useQuery({
    queryKey: ['transactions', page, limit, type, status],
    queryFn: async () => {
      const res = await transactionsApi.getAll(page, limit, type, status);
      return res.data.data;
    },
  });
}

export function useTransaction(id: number) {
  return useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => {
      const res = await transactionsApi.getById(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateDraftTransaction() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ header, details }: { header: TransactionHeaderInput; details: TransactionDetailInput[] }) =>
      transactionsApi.createDraft(header, details),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showSuccess('Transaction draft created successfully');
      if (response.data?.data?.id) {
        navigate(`/transactions/${response.data.data.id}`);
      } else {
        navigate('/transactions');
      }
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create transaction'));
    },
  });
}

export function useApproveTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => transactionsApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      showSuccess('Transaction approved successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to approve transaction'));
    },
  });
}
