import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useItemCard } from '@/hooks/useItems';
import { PageHeader, LoadingSpinner, Badge, Button } from '@/components/ui';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { formatDateTime, formatNumber, formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { StockMovement, Transaction, TransactionType, MovementType } from '@/types';

export default function ItemCardPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useItemCard(Number(id));

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  if (!data) {
    return <div className="text-center py-12 text-gray-500">{t('common.notFound')}</div>;
  }

  const { item, recent_movements, summary, last_receiving_voucher, last_issuing_voucher } = data;

  const category = { name_ar: item.category_name_ar, name_en: item.category_name_en };
  const subcategory = { name_ar: item.subcategory_name_ar, name_en: item.subcategory_name_en };
  const unit = { name_ar: item.unit_name_ar, name_en: item.unit_name_en };
  const warehouse = { name_ar: item.warehouse_name_ar, name_en: item.warehouse_name_en };

  const getMovementBadge = (type: MovementType) =>
    type === 'IN' ? <Badge variant="success">IN</Badge> : <Badge variant="danger">OUT</Badge>;

  return (
    <div>
      <PageHeader
        title={getLocalizedName(item)}
        subtitle={`${t('pages.items.itemCard')} - ${item.item_code}`}
        actions={
          <Button variant="secondary" onClick={() => navigate('/items')}>
            <ArrowLeftIcon className="h-4 w-4 me-2" />
            {t('pages.items.backToItems')}
          </Button>
        }
      />

      {/* Item Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">{t('pages.items.itemDetails')}</h3>
          <dl className="space-y-2">
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('table.itemCode')}</dt><dd className="text-sm font-medium">{item.item_code}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('table.category')}</dt><dd className="text-sm font-medium">{getLocalizedName(category)}</dd></div>
            {item.subcategory_id && <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('table.subcategory')}</dt><dd className="text-sm font-medium">{getLocalizedName(subcategory)}</dd></div>}
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('table.unit')}</dt><dd className="text-sm font-medium">{getLocalizedName(unit)}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('table.warehouse')}</dt><dd className="text-sm font-medium">{getLocalizedName(warehouse)}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('form.location')}</dt><dd className="text-sm font-medium">{item.location || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('form.minStockLevel')}</dt><dd className="text-sm font-medium">{formatNumber(item.min_stock_level)}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('form.maxStockLevel')}</dt><dd className="text-sm font-medium">{formatNumber(item.max_stock_level)}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('table.lastPurchasePrice')}</dt><dd className="text-sm font-medium">{item.last_purchase_price ? formatNumber(item.last_purchase_price, 2) : '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('pages.items.itemType')}</dt><dd className="text-sm font-medium">{item.is_consumable === false ? <Badge variant="warning">{t('pages.items.durable')}</Badge> : <Badge variant="info">{t('pages.items.consumable')}</Badge>}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('pages.items.expiryAlertDays')}</dt><dd className="text-sm font-medium">{item.is_consumable === false ? formatNumber(item.expiry_alert_days) : '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('pages.items.sapMaterialNumber')}</dt><dd className="text-sm font-medium">{item.sap_material_number || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500">{t('pages.items.glAccount')}</dt><dd className="text-sm font-medium">{item.gl_account || '-'}</dd></div>
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">{t('pages.items.currentBalance')}</h3>
          <div className="text-4xl font-bold text-primary-600 mb-4">{formatNumber(item.current_balance)}</div>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-gray-500">{t('pages.items.totalIn')}</span><span className="text-sm font-medium text-green-600">+{formatNumber(summary?.total_in || 0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">{t('pages.items.totalOut')}</span><span className="text-sm font-medium text-red-600">-{formatNumber(summary?.total_out || 0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">{t('pages.items.totalMovements')}</span><span className="text-sm font-medium">{summary?.total_movements || 0}</span></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">{t('pages.items.lastVouchers')}</h3>
          {last_receiving_voucher ? (
            <div className="mb-4 p-3 bg-green-50 rounded-lg">
              <p className="text-xs font-medium text-green-700 mb-1">{t('pages.items.lastReceiving')}</p>
              <p className="text-sm font-medium">{last_receiving_voucher.transaction_no}</p>
              <p className="text-xs text-gray-500">{formatDate(last_receiving_voucher.transaction_date)}</p>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500">{t('pages.items.noReceivingVouchers')}</p></div>
          )}
          {last_issuing_voucher ? (
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="text-xs font-medium text-red-700 mb-1">{t('pages.items.lastIssuing')}</p>
              <p className="text-sm font-medium">{last_issuing_voucher.transaction_no}</p>
              <p className="text-xs text-gray-500">{formatDate(last_issuing_voucher.transaction_date)}</p>
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500">{t('pages.items.noIssuingVouchers')}</p></div>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">{t('pages.items.recentMovements')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.date')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.type')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.change')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.before')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.after')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.transaction')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.unitCost')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.totalValue')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recent_movements?.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">{t('pages.items.noMovements')}</td></tr>
              ) : (
                recent_movements?.map((mov: any) => (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{formatDateTime(mov.movement_date)}</td>
                    <td className="px-4 py-3 text-sm">{getMovementBadge(mov.movement_type)}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <span className={mov.quantity_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {mov.quantity_change >= 0 ? '+' : ''}{formatNumber(mov.quantity_change)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatNumber(mov.quantity_before)}</td>
                    <td className="px-4 py-3 text-sm">{formatNumber(mov.quantity_after)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{mov.transaction_no || `#${mov.transaction_id}`}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{mov.unit_cost ? formatNumber(mov.unit_cost, 2) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{mov.total_value ? formatNumber(mov.total_value, 2) : '-'}</td>
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
