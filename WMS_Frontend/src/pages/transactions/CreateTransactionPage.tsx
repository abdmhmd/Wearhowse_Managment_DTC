import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAllDepartments } from '@/hooks/useDepartments';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useItems } from '@/hooks/useItems';
import { useAllUnits } from '@/hooks/useUnits';
import { useUnitConversionsByItem } from '@/hooks/useUnitConversions';
import { useCreateDraftTransaction } from '@/hooks/useTransactions';
import { PageHeader, Button, Input, Select, Modal, SearchableSelect } from '@/components/ui';
import { PlusIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { type TransactionType } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDraftTransactionFormSchema, type CreateDraftTransactionFormFormData } from '@/schemas/transactions.schema';
import { formatNumber } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { showError } from '@/utils/toast';

interface LineItem {
  item_id: number;
  quantity: number;
  unit_code: string;
  unit_price?: number;
  unit_cost?: number;
  total_value?: number;
  batch_number?: string | null;
  expiry_tracking_enabled?: boolean;
  production_date?: string | null;
  expiry_date?: string | null;
}

export default function CreateTransactionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [currentLine, setCurrentLine] = useState<Partial<LineItem>>({});

  const { data: departmentsData } = useAllDepartments();
  const { data: warehousesData } = useAllWarehouses();
  const { data: itemsData } = useItems(1, 200);
  const { data: unitsData } = useAllUnits();
  const createMutation = useCreateDraftTransaction();
  const { data: conversionsData } = useUnitConversionsByItem(currentLine.item_id || 0);

  const departments = departmentsData?.items || [];
  const warehouses = warehousesData?.items || [];
  const items = itemsData?.items || [];
  const units = unitsData?.items || [];

  const selectedItem = currentLine.item_id ? items.find((i: any) => i.id === currentLine.item_id) : undefined;
  const conversions = conversionsData || [];
  const validUnits = selectedItem
    ? [selectedItem.unit_code, ...conversions
        .filter((c: any) => c.from_unit_code === selectedItem.unit_code)
        .map((c: any) => c.to_unit_code)]
    : [];
  const unitOptions = validUnits.length > 0
    ? units.filter((u: any) => validUnits.includes(u.code)).map((u: any) => ({ value: u.code, label: `${u.code} (${getLocalizedName(u)})` }))
    : units.map((u: any) => ({ value: u.code, label: `${u.code} (${getLocalizedName(u)})` }));

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CreateDraftTransactionFormFormData>({
    resolver: zodResolver(createDraftTransactionFormSchema),
    defaultValues: {
      header: { type: 'RV', warehouse_id: undefined as any },
    },
  });

  const transactionType = watch('header.type');
  const isRV = transactionType === 'RV';

  const addLineItem = () => {
    if (!currentLine.item_id || !currentLine.quantity || !currentLine.unit_code) {
      showError(t('transaction.fillRequired'));
      return;
    }
    if (isRV && currentLine.expiry_tracking_enabled && !currentLine.expiry_date) {
      showError(t('transaction.expiryDateRequired'));
      return;
    }
    const item = items.find((i: any) => i.id === currentLine.item_id);
    const unitPrice = Number(isRV ? (currentLine.unit_price || 0) : (item?.last_purchase_price || 0));
    const quantity = Number(currentLine.quantity);
    const totalValue = quantity * unitPrice;
    const lineItem: LineItem = {
      item_id: currentLine.item_id,
      quantity,
      unit_code: currentLine.unit_code,
      unit_price: isRV ? unitPrice : 0,
      unit_cost: unitPrice,
      total_value: totalValue,
      batch_number: currentLine.batch_number,
      expiry_tracking_enabled: currentLine.expiry_tracking_enabled,
      production_date: currentLine.production_date,
      expiry_date: currentLine.expiry_date,
    };
    setLineItems([...lineItems, lineItem]);
    setCurrentLine({});
    setShowItemPicker(false);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: CreateDraftTransactionFormFormData) => {
    if (lineItems.length === 0) {
      showError(t('transaction.addAtLeastOne'));
      return;
    }
    if (isRV && lineItems.some(l => !l.unit_price || l.unit_price <= 0)) {
      showError(t('transaction.unitPriceRequired'));
      return;
    }
    const response = await createMutation.mutateAsync({
      header: data.header,
      details: lineItems,
    });
  };

  const onError = (formErrors: any) => {
    const firstError = Object.values(formErrors).flatMap((v: any) =>
      typeof v === 'object' && v?.message ? v.message : Object.values(v || {}).map((e: any) => e?.message).filter(Boolean)
    )[0];
    if (firstError) showError(String(firstError));
  };

  return (
    <div>
      <PageHeader
        title={t('transaction.newTransaction')}
        subtitle={t('pages.transactions.createSubtitle')}
        actions={
          <Button variant="secondary" onClick={() => navigate('/transactions')}>
            <ArrowLeftIcon className="h-4 w-4 me-2" />
            {t('common.back')}
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-6">
        {/* Header Section */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">{t('transaction.header')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('transaction.type')} *</label>
              <select
                {...register('header.type')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {(['RV', 'LN'] as TransactionType[]).map((key) => (
                  <option key={key} value={key}>{t('transaction.types.' + key)} ({key})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tx-warehouse" className="block text-sm font-medium text-gray-700 mb-1">
                {`${t('form.warehouse')} *`}
              </label>
              <SearchableSelect
                id="tx-warehouse"
                aria-label={t('form.warehouse')}
                value={(watch('header.warehouse_id') ?? null) as number | null}
                onChange={(v) => setValue('header.warehouse_id', v === null ? (undefined as any) : Number(v), { shouldValidate: true })}
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: `${w.code} — ${getLocalizedName(w)}`,
                  sublabel: w.department_name_ar || w.department_name_en
                    ? getLocalizedName({ name_ar: w.department_name_ar, name_en: w.department_name_en })
                    : undefined,
                }))}
                placeholder={t('components.warehousePicker.placeholder')}
                searchPlaceholder={t('components.warehousePicker.searchPlaceholder')}
                emptyMessage={t('components.warehousePicker.emptyMessage')}
              />
              {errors.header?.warehouse_id?.message && (
                <p className="mt-1 text-sm text-red-600">{errors.header.warehouse_id.message as string}</p>
              )}
            </div>
            {transactionType === 'LN' && (
              <div>
                <label htmlFor="tx-department" className="block text-sm font-medium text-gray-700 mb-1">
                  {`${t('form.department')} *`}
                </label>
                <SearchableSelect
                  id="tx-department"
                  aria-label={t('form.department')}
                  value={(watch('header.department_id') ?? null) as number | null}
                  onChange={(v) => setValue('header.department_id', v === null ? (undefined as any) : Number(v), { shouldValidate: true })}
                  options={departments.map((d: any) => ({ value: d.id, label: getLocalizedName(d) }))}
                  placeholder={t('components.departmentPicker.placeholder')}
                  searchPlaceholder={t('components.departmentPicker.searchPlaceholder')}
                  emptyMessage={t('components.departmentPicker.emptyMessage')}
                />
                {errors.header?.department_id?.message && (
                  <p className="mt-1 text-sm text-red-600">{errors.header.department_id.message as string}</p>
                )}
              </div>
            )}
          </div>
          <div className="mt-4">
            <Input label={t('form.notes')} {...register('header.notes')} placeholder={t('form.optionalNotes')} />
          </div>
        </div>

        {/* Line Items Section */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{t('form.lineItems')}</h3>
            <Button type="button" onClick={() => setShowItemPicker(true)}>
              <PlusIcon className="h-4 w-4 me-2" />
              {t('form.addItem')}
            </Button>
          </div>

          {lineItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
              {t('transaction.noItemsYet')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">#</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.item')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.unit')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.quantity')}</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.unitPrice')}</th>
                    {isRV && <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('transaction.productionDate')}</th>}
                    {isRV && <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('transaction.expiryDate')}</th>}
                    <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.totalValue')}</th>
                    <th className="px-4 py-3 text-end text-xs font-semibold text-gray-600 uppercase">{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lineItems.map((line, idx) => {
                    const item = items.find((i: any) => i.id === line.item_id);
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium">{item ? getLocalizedName(item) : `${t('table.item')} #${line.item_id}`}</td>
                        <td className="px-4 py-3 text-sm">{line.unit_code}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={transactionType === 'LN' ? 'text-red-600' : 'text-green-600'}>
                            {transactionType === 'LN' ? '-' : '+'}{formatNumber(line.quantity)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{line.unit_cost ? formatNumber(line.unit_cost, 2) : '-'}</td>
                        {isRV && <td className="px-4 py-3 text-sm">{line.production_date || '-'}</td>}
                        {isRV && <td className="px-4 py-3 text-sm">{line.expiry_date || '-'}</td>}
                        <td className="px-4 py-3 text-sm font-medium">{line.total_value ? formatNumber(line.total_value, 2) : '-'}</td>
                        <td className="px-4 py-3 text-end">
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(idx)}>
                            <TrashIcon className="h-4 w-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={isRV ? 6 : 4}></td>
                    <td className="px-4 py-2 text-sm font-semibold">{t('table.total')}</td>
                    <td className="px-4 py-2 text-sm font-bold">{formatNumber(lineItems.reduce((s, l) => s + (l.total_value || 0), 0), 2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/transactions')}>{t('common.cancel')}</Button>
          <Button type="submit" isLoading={createMutation.isPending} size="lg">{t('transaction.createDraft')}</Button>
        </div>
      </form>

      {/* Add Item Modal */}
      <Modal isOpen={showItemPicker} onClose={() => { setShowItemPicker(false); setCurrentLine({}); }} title={t('form.addItem')}>
          <div className="space-y-4">
          <Select
            label={`${t('table.item')} *`}
            value={currentLine.item_id || ''}
            onChange={(e) => {
              const item = items.find((i: any) => i.id === Number(e.target.value));
              setCurrentLine({
                ...currentLine,
                item_id: Number(e.target.value),
                unit_code: item?.unit_code || '',
                unit_price: isRV ? undefined : Number(item?.last_purchase_price || 0),
                expiry_tracking_enabled: false,
                production_date: undefined,
                expiry_date: undefined,
              });
            }}
            placeholder={t('form.selectItem')}
            options={items.map((i: any) => ({ value: i.id, label: `${i.item_code} - ${getLocalizedName(i)} (${t('table.balance')}: ${formatNumber(i.current_balance)} ${i.unit_code})` }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={`${t('table.quantity')} *`}
              type="number"
              step="0.0001"
              value={currentLine.quantity || ''}
              onChange={(e) => setCurrentLine({ ...currentLine, quantity: Number(e.target.value) })}
            />
            <Select
              label={`${t('table.unit')} *`}
              value={currentLine.unit_code || ''}
              onChange={(e) => setCurrentLine({ ...currentLine, unit_code: e.target.value })}
              placeholder={selectedItem ? t('form.selectUnit') : t('form.selectItemFirst')}
              disabled={!selectedItem}
              options={unitOptions}
            />
          </div>
          {isRV ? (
            <Input
              label={`${t('table.unitPrice')} *`}
              type="number"
              step="0.01"
              value={currentLine.unit_price || ''}
              onChange={(e) => setCurrentLine({ ...currentLine, unit_price: Number(e.target.value) })}
            />
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('table.unitCost')}</label>
              <input
                value={currentLine.unit_price !== undefined ? formatNumber(currentLine.unit_price, 2) : ''}
                disabled
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
          )}
          {isRV && (
            <div className="border-t border-gray-100 pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={!!currentLine.expiry_tracking_enabled}
                  onChange={(e) => setCurrentLine({ ...currentLine, expiry_tracking_enabled: e.target.checked })}
                  className="rounded border-gray-300"
                />
                {t('transaction.expiryTracking')}
              </label>
              {currentLine.expiry_tracking_enabled && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Input
                    label={t('transaction.productionDate')}
                    type="date"
                    value={currentLine.production_date || ''}
                    onChange={(e) => setCurrentLine({ ...currentLine, production_date: e.target.value || null })}
                  />
                  <Input
                    label={`${t('transaction.expiryDate')} *`}
                    type="date"
                    value={currentLine.expiry_date || ''}
                    onChange={(e) => setCurrentLine({ ...currentLine, expiry_date: e.target.value || null })}
                  />
                </div>
              )}
            </div>
          )}
          {currentLine.quantity && currentLine.unit_price !== undefined && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{t('table.totalValue')}: </span>
              <span className="font-bold">{formatNumber(Number(currentLine.quantity) * Number(currentLine.unit_price || 0), 2)}</span>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setShowItemPicker(false); setCurrentLine({}); }}>{t('common.cancel')}</Button>
            <Button type="button" onClick={addLineItem}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
