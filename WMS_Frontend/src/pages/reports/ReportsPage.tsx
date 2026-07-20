import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useInventoryReport } from '@/hooks/useReports';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useCategories } from '@/hooks/useCategories';
import { PageHeader, DataTable, Badge } from '@/components/ui';
import { formatNumber } from '@/utils';
import type { InventoryReportItem } from '@/types';
import type { InventoryReportFilters } from '@/api/reports.api';

export default function ReportsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<InventoryReportFilters>({ page: 1, limit: 20 });
  const { data, isLoading } = useInventoryReport(filters);
  const { data: warehousesData } = useAllWarehouses();
  const { data: categoriesData } = useCategories(1, 200);

  const warehouses = warehousesData?.data || [];
  const categories = categoriesData?.data || [];

  const columns = [
    { key: 'item_code', header: t('reports.itemCode') },
    {
      key: 'name_ar', header: t('reports.name'),
      render: (item: InventoryReportItem) => getLocalizedName(item),
    },
    { key: 'category_name', header: t('reports.category') },
    { key: 'unit_name', header: t('reports.unit') },
    { key: 'warehouse_name', header: t('reports.warehouse') },
    {
      key: 'current_balance', header: t('reports.balance'),
      render: (item: InventoryReportItem) => {
        const isLow = item.current_balance <= item.min_stock_level;
        const isOver = item.current_balance >= item.max_stock_level;
        return (
          <span className={isLow ? 'text-red-600 font-semibold' : isOver ? 'text-yellow-600 font-semibold' : ''}>
            {formatNumber(item.current_balance)}
          </span>
        );
      },
    },
    { key: 'min_stock_level', header: t('reports.minStock'), render: (item: InventoryReportItem) => formatNumber(item.min_stock_level) },
    { key: 'max_stock_level', header: t('reports.maxStock'), render: (item: InventoryReportItem) => formatNumber(item.max_stock_level) },
    {
      key: 'stock_status', header: t('reports.status'),
      render: (item: InventoryReportItem) => {
        if (item.current_balance <= item.min_stock_level) return <Badge variant="danger">{t('reports.lowStock')}</Badge>;
        if (item.current_balance >= item.max_stock_level) return <Badge variant="warning">{t('reports.overstock')}</Badge>;
        return <Badge variant="success">{t('reports.normalStock')}</Badge>;
      },
    },
    {
      key: 'stock_summary', header: t('reports.movements'),
      render: (item: InventoryReportItem) => (
        <span className="text-xs text-gray-500">
          {item.stock_summary?.total_movements || 0} ({item.stock_summary?.total_in || 0} IN / {item.stock_summary?.total_out || 0} OUT)
        </span>
      ),
    },
  ];

  const setPage = (p: number) => setFilters({ ...filters, page: p });

  return (
    <div>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <div className="mb-4 bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder={t('common.search')}
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
          <select
            value={filters.warehouse_id || ''}
            onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="">{t('common.allWarehouses')}</option>
            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{getLocalizedName(w)}</option>)}
          </select>
          <select
            value={filters.category_code || ''}
            onChange={(e) => setFilters({ ...filters, category_code: e.target.value || undefined, page: 1 })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="">{t('common.allCategories')}</option>
            {categories.map((c: any) => <option key={c.code} value={c.code}>{getLocalizedName(c)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.low_stock === 'true'}
              onChange={(e) => setFilters({ ...filters, low_stock: e.target.checked ? 'true' : undefined, page: 1 })}
              className="rounded border-gray-300"
            />
            {t('reports.lowStockOnly')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.overstock === 'true'}
              onChange={(e) => setFilters({ ...filters, overstock: e.target.checked ? 'true' : undefined, page: 1 })}
              className="rounded border-gray-300"
            />
            {t('reports.overstockOnly')}
          </label>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={(data?.data || []) as any[]}
        pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined}
        emptyMessage={t('reports.noData')}
      />
    </div>
  );
}
