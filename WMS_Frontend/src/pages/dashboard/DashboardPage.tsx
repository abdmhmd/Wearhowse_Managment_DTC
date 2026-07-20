import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { itemsApi } from '@/api/items.api';
import { transactionsApi } from '@/api/transactions.api';
import { stockMovementsApi } from '@/api/stock-movements.api';
import { PageHeader, LoadingSpinner, Badge } from '@/components/ui';
import { CubeIcon, ExclamationTriangleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { formatDateTime, formatNumber } from '@/utils';
import { TRANSACTION_TYPE_LABELS } from '@/types';
import type { TransactionType, MovementType } from '@/types';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['items', 'dashboard'],
    queryFn: async () => {
      const res = await itemsApi.getAll(1, 100);
      return res.data;
    },
  });

  const { data: transactionsData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', 'dashboard'],
    queryFn: async () => {
      const res = await transactionsApi.getAll(1, 100);
      return res.data;
    },
  });

  const { data: movementsData, isLoading: movLoading } = useQuery({
    queryKey: ['stock-movements', 'dashboard'],
    queryFn: async () => {
      const res = await stockMovementsApi.getAll(1, 10);
      return res.data;
    },
  });

  const isLoading = itemsLoading || txLoading || movLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const items = itemsData?.data || [];
  const transactions = transactionsData?.data || [];
  const movements = movementsData?.data || [];

  const totalItems = itemsData?.pagination?.total || items.length;
  const lowStockItems = items.filter((item: any) => item.current_balance <= item.min_stock_level).length;
  const pendingDrafts = transactions.filter((tx: any) => tx.status === 'draft').length;

  const stats = [
    { label: t('dashboard.totalItems'), value: totalItems, icon: CubeIcon, color: 'bg-blue-500' },
    { label: t('dashboard.lowStockItems'), value: lowStockItems, icon: ExclamationTriangleIcon, color: 'bg-yellow-500' },
    { label: t('dashboard.pendingDrafts'), value: pendingDrafts, icon: DocumentTextIcon, color: 'bg-purple-500' },
  ];

  const getMovementBadge = (type: MovementType) => {
    return type === 'IN'
      ? <Badge variant="success">IN</Badge>
      : <Badge variant="danger">OUT</Badge>;
  };

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-4">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.recentMovements')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.date')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.item')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.type')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.quantityChange')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.before')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.after')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('stockMovements.transaction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    {t('stockMovements.noMovements')}
                  </td>
                </tr>
              ) : (
                movements.map((mov: any) => (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(mov.movement_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {getLocalizedName(mov) || mov.item_code || `Item #${mov.item_id}`}
                    </td>
                    <td className="px-4 py-3 text-sm">{getMovementBadge(mov.movement_type)}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <span className={mov.quantity_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {mov.quantity_change >= 0 ? '+' : ''}{formatNumber(mov.quantity_change)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatNumber(mov.quantity_before)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatNumber(mov.quantity_after)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {mov.transaction_no || `#${mov.transaction_id}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
