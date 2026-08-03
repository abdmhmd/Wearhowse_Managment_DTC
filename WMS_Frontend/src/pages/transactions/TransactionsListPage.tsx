import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '@/hooks/useTransactions';
import { PageHeader, Button, DataTable, Badge } from '@/components/ui';
import { PlusIcon, EyeIcon } from '@heroicons/react/24/outline';
import { formatDateTime } from '@/utils';
import type { Transaction, TransactionType, TransactionStatus } from '@/types';

export default function TransactionsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data } = useTransactions(page, 20, typeFilter || undefined, statusFilter || undefined);

  const getTypeBadge = (type: TransactionType) => {
    const colors: Record<TransactionType, string> = {
      RV: 'bg-green-100 text-green-800',
      LN: 'bg-red-100 text-red-800',
      RTV: 'bg-orange-100 text-orange-800',
      RTI: 'bg-blue-100 text-blue-800',
      ADJ: 'bg-purple-100 text-purple-800',
      TRF: 'bg-indigo-100 text-indigo-800',
    };
    return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[type]}`}>{t('transaction.types.' + type)}</span>;
  };

  const getStatusBadge = (status: TransactionStatus) =>
    status === 'approved' ? <Badge variant="success">{t('transaction.statuses.approved')}</Badge> : <Badge variant="warning">{t('transaction.statuses.draft')}</Badge>;

  const columns = [
    { key: 'transaction_no', header: t('table.transactionNo'), render: (item: Transaction) => <span className="font-medium text-primary-600">{item.transaction_no}</span> },
    { key: 'type', header: t('table.type'), render: (item: Transaction) => getTypeBadge(item.type) },
    { key: 'status', header: t('table.status'), render: (item: Transaction) => getStatusBadge(item.status) },
    { key: 'transaction_date', header: t('table.date'), render: (item: Transaction) => formatDateTime(item.transaction_date) },
    { key: 'warehouse_id', header: t('table.warehouseId') },
    { key: 'notes', header: t('table.notes'), render: (item: Transaction) => <span className="text-gray-500 truncate max-w-[200px] block">{item.notes || '-'}</span> },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Transaction) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${item.id}`); }}>
            <EyeIcon className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.transactions')}
        subtitle={t('pages.transactions.subtitle')}
        actions={
          <Button onClick={() => navigate('/transactions/new')}>
            <PlusIcon className="h-4 w-4 me-2" />
            {t('transaction.newTransaction')}
          </Button>
        }
      />

      <div className="mb-4 flex gap-3">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')} {t('table.type')}</option>
          {(['RV', 'LN', 'RTV', 'RTI', 'ADJ', 'TRF'] as TransactionType[]).map((key) => (
            <option key={key} value={key}>{t('transaction.types.' + key)}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')} {t('table.status')}</option>
          <option value="draft">{t('transaction.statuses.draft')}</option>
          <option value="approved">{t('transaction.statuses.approved')}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={(data?.data || []) as any[]}
        pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined}
        onRowClick={(item) => navigate(`/transactions/${(item as Transaction).id}`)}
        emptyMessage={t('common.noData')}
      />
    </div>
  );
}
