import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustodies } from '@/hooks/useCustodies';
import { PageHeader, Button, DataTable, Badge } from '@/components/ui';
import ReturnCustodyModal from '@/components/custodies/ReturnCustodyModal';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { Custody } from '@/types';

const statusBadge = (status: string, t: any) => {
  if (status === 'active') return <Badge variant="success">{t('pages.custodies.active')}</Badge>;
  if (status === 'damaged') return <Badge variant="warning">{t('pages.custodies.damaged')}</Badge>;
  if (status === 'lost') return <Badge variant="danger">{t('pages.custodies.lost')}</Badge>;
  return <Badge variant="default">{t('pages.custodies.returned')}</Badge>;
};

export default function CustodiesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [returningCustody, setReturningCustody] = useState<Custody | null>(null);

  const { data } = useCustodies(page, 20, statusFilter ? { status: statusFilter as any } : undefined);

  const columns = [
    { key: 'item', header: t('pages.custodies.item'), render: (item: any) => <span>{item.item_code} - {getLocalizedName({ name_ar: item.item_name_ar, name_en: item.item_name_en })}</span> },
    { key: 'assigned_to', header: t('pages.custodies.assignedTo'), render: (item: any) => item.assigned_to_name || '-' },
    { key: 'project', header: t('pages.custodies.project'), render: (item: any) => item.project_no ? `${item.project_no} - ${item.project_name || ''}` : '-' },
    { key: 'quantity', header: t('pages.custodies.quantity'), render: (item: any) => `${item.quantity} ${item.unit_code}` },
    { key: 'warehouse', header: t('table.warehouse'), render: (item: any) => getLocalizedName({ name_ar: item.warehouse_name_ar, name_en: item.warehouse_name_en }) },
    { key: 'issued_voucher', header: t('pages.custodies.issueVoucher'), render: (item: any) => item.issued_transaction_no || `#${item.issued_transaction_id}` },
    {
      key: 'status', header: t('pages.custodies.status'),
      render: (item: any) => statusBadge(item.status, t),
    },
    { key: 'return_voucher', header: t('pages.custodies.returnVoucher'), render: (item: any) => item.return_transaction_no || '-' },
    { key: 'created_at', header: t('pages.custodies.issuedOn'), render: (item: any) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => item.status === 'active' ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setReturningCustody(item); }}>
            <ArrowUturnLeftIcon className="h-4 w-4 text-green-600" />
          </Button>
        </div>
      ) : <span className="text-sm text-gray-400">{formatDate(item.returned_at)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('pages.custodies.title')} subtitle={t('pages.custodies.subtitle')} />

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')}</option>
          <option value="active">{t('pages.custodies.active')}</option>
          <option value="returned">{t('pages.custodies.returned')}</option>
          <option value="damaged">{t('pages.custodies.damaged')}</option>
          <option value="lost">{t('pages.custodies.lost')}</option>
        </select>
      </div>

      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('pages.custodies.noData')} />

      <ReturnCustodyModal custody={returningCustody} onClose={() => setReturningCustody(null)} />
    </div>
  );
}
