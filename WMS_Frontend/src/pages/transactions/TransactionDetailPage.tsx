import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTransaction, useApproveTransaction } from '@/hooks/useTransactions';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, LoadingSpinner, Badge, Button } from '@/components/ui';
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { formatDateTime, formatNumber } from '@/utils';
import type { TransactionType, TransactionStatus } from '@/types';
import { showConfirm } from '@/utils/toast';

export default function TransactionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useTransaction(Number(id));
  const approveMutation = useApproveTransaction();
  const { user } = useAuthStore();

  const canApprove = user && ['warehouse_manager', 'system_admin'].includes(user.role);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  if (!data?.data) {
    return <div className="text-center py-12 text-gray-500">{t('common.notFound')}</div>;
  }

  const txn = data.data;
  const details = txn.details || [];

  const txType = txn.type as TransactionType;
  const txStatus = txn.status as TransactionStatus;

  const handleApprove = async () => {
    showConfirm(t('transaction.confirmApprove'), async () => {
      await approveMutation.mutateAsync(txn.id);
    });
  };

  const getTypeBadge = (type: TransactionType) => {
    const colors: Record<TransactionType, string> = {
      RV: 'bg-green-100 text-green-800',
      LN: 'bg-red-100 text-red-800',
      RTV: 'bg-yellow-100 text-yellow-800',
      RTI: 'bg-blue-100 text-blue-800',
      ADJ: 'bg-purple-100 text-purple-800',
      TRF: 'bg-indigo-100 text-indigo-800',
    };
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[type]}`}>{t('transaction.types.' + type)}</span>;
  };

  const getStatusBadge = (status: TransactionStatus) =>
    status === 'approved' ? <Badge variant="success">{t('transaction.statuses.approved')}</Badge> : <Badge variant="warning">{t('transaction.statuses.draft')}</Badge>;

  const totalAmount = details.reduce((sum: number, d: any) => sum + (d.quantity * d.unit_price), 0);

  return (
    <div>
      <PageHeader
        title={txn.transaction_no}
        subtitle={`${t('transaction.types.' + txType)} - ${formatDateTime(txn.created_at)}`}
        actions={
          <div className="flex gap-3">
            {canApprove && txStatus === 'draft' && (
              <Button onClick={handleApprove} isLoading={approveMutation.isPending}>
                <CheckCircleIcon className="h-4 w-4 me-2" />
                {t('transaction.approveTransaction')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/transactions')}>
              <ArrowLeftIcon className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
          </div>
        }
      />

      {/* Header Info */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500">{t('table.status')}</p>
            <div className="mt-1">{getStatusBadge(txStatus)}</div>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('table.type')}</p>
            <div className="mt-1">{getTypeBadge(txType)}</div>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('transaction.transactionDate')}</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(txn.transaction_date)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('table.warehouseId')}</p>
            <p className="mt-1 text-sm font-medium">#{txn.warehouse_id}</p>
          </div>
          {txn.supplier_id && (
            <div>
              <p className="text-sm text-gray-500">{t('transaction.supplierId')}</p>
              <p className="mt-1 text-sm font-medium">#{txn.supplier_id}</p>
            </div>
          )}
          {txn.department_id && (
            <div>
              <p className="text-sm text-gray-500">{t('transaction.departmentId')}</p>
              <p className="mt-1 text-sm font-medium">#{txn.department_id}</p>
            </div>
          )}
          {txn.approved_by && (
            <div>
              <p className="text-sm text-gray-500">{t('transaction.approvedBy')}</p>
              <p className="mt-1 text-sm font-medium">{t('transaction.user')} #{txn.approved_by}</p>
            </div>
          )}
          {txn.notes && (
            <div className="col-span-2">
              <p className="text-sm text-gray-500">{t('form.notes')}</p>
              <p className="mt-1 text-sm">{txn.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">{t('form.lineItems')} ({details.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">#</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.itemId')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.unit')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.quantity')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {details.map((detail: any, idx: number) => (
                <tr key={detail.id || idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">#{detail.item_id}</td>
                  <td className="px-4 py-3 text-sm">{detail.unit_code}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={txType === 'LN' || txType === 'RTV' ? 'text-red-600' : 'text-green-600'}>
                      {formatNumber(detail.quantity)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
