import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { PageHeader, Button, DataTable, Badge, Input } from '@/components/ui';
import { EyeIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'default';
    case 'approved': return 'info';
    case 'partially_received': return 'warning';
    case 'received':
    case 'closed': return 'success';
    case 'cancelled': return 'danger';
    default: return 'default';
  }
};

export default function PurchaseOrdersListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const filter = search.trim() ? { search: search.trim() } : undefined;
  const { data } = usePurchaseOrders(page, 20, filter);

  const items = data?.items || [];

  const columns = [
    {
      key: 'po_number',
      header: t('pages.purchaseOrders.poNumber'),
      render: (po: any) => <span className="font-medium text-gray-900">{po.po_number}</span>,
    },
    {
      key: 'supplier_name',
      header: t('pages.purchaseOrders.supplier'),
      render: (po: any) => po.supplier_name || '—',
    },
    {
      key: 'warehouse',
      header: t('pages.purchaseOrders.receivingWarehouse'),
      render: (po: any) => getLocalizedName({ name_ar: po.warehouse_name_ar, name_en: po.warehouse_name_en }),
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (po: any) => (
        <Badge variant={statusVariant(po.status)}>{t(`pages.purchaseOrders.statuses.${po.status}`)}</Badge>
      ),
    },
    {
      key: 'order_date',
      header: t('pages.purchaseOrders.orderDate'),
      render: (po: any) => formatDate(po.order_date),
    },
    {
      key: 'expected_date',
      header: t('pages.purchaseOrders.expectedDate'),
      render: (po: any) => (po.expected_date ? formatDate(po.expected_date) : '-'),
    },
    {
      key: 'created_by_name',
      header: t('pages.purchaseOrders.createdBy'),
      render: (po: any) => po.created_by_name || '-',
    },
    {
      key: 'actions',
      header: '',
      render: (po: any) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/purchase-orders/${po.id}`); }}
          className="p-1.5 rounded hover:bg-gray-100"
          title={t('common.view')}
        >
          <EyeIcon className="h-4 w-4 text-gray-500" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('pages.purchaseOrders.title')}
        subtitle={t('pages.purchaseOrders.subtitle')}
        actions={
          <Button onClick={() => navigate('/purchase-orders/new')}>
            <PlusIcon className="h-4 w-4 me-1" />
            {t('pages.purchaseOrders.new')}
          </Button>
        }
      />

      <div className="max-w-xs">
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        data={items as any[]}
        emptyMessage={t('pages.purchaseOrders.empty')}
        pagination={{
          page,
          limit: 20,
          total: data?.pagination?.total ?? 0,
          totalPages: data?.pagination?.totalPages ?? 1,
          onPageChange: setPage,
        }}
        onRowClick={(po: any) => navigate(`/purchase-orders/${po.id}`)}
      />
    </div>
  );
}
