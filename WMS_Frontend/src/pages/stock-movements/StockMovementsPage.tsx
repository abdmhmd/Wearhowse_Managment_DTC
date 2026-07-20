import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useStockMovements } from '@/hooks/useStockMovements';
import { PageHeader, DataTable, Badge } from '@/components/ui';
import { formatDateTime, formatNumber } from '@/utils';
import { TRANSACTION_TYPE_LABELS } from '@/types';
import type { StockMovement, MovementType } from '@/types';

export default function StockMovementsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data } = useStockMovements(page);

  const getMovementBadge = (type: MovementType) =>
    type === 'IN' ? <Badge variant="success">IN</Badge> : <Badge variant="danger">OUT</Badge>;

  const columns = [
    { key: 'id', header: t('stockMovements.id') },
    { key: 'movement_date', header: t('stockMovements.date'), render: (item: StockMovement) => formatDateTime(item.movement_date) },
    { key: 'item_id', header: t('stockMovements.itemId') },
    {
      key: 'movement_type', header: t('stockMovements.type'),
      render: (item: StockMovement) => getMovementBadge(item.movement_type),
    },
    {
      key: 'quantity_change', header: t('stockMovements.change'),
      render: (item: StockMovement) => (
        <span className={item.quantity_change >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {item.quantity_change >= 0 ? '+' : ''}{formatNumber(item.quantity_change)}
        </span>
      ),
    },
    { key: 'quantity_before', header: t('stockMovements.before'), render: (item: StockMovement) => formatNumber(item.quantity_before) },
    { key: 'quantity_after', header: t('stockMovements.after'), render: (item: StockMovement) => formatNumber(item.quantity_after) },
    { key: 'transaction_id', header: t('stockMovements.transactionId') },
    { key: 'user_id', header: t('stockMovements.userId') },
  ];

  return (
    <div>
      <PageHeader title={t('nav.stockMovements')} subtitle={t('stockMovements.subtitle')} />
      <DataTable
        columns={columns}
        data={(data?.data || []) as any[]}
        pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined}
        emptyMessage={t('stockMovements.noMovements')}
      />
    </div>
  );
}
