import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAllSuppliers } from '@/hooks/useSuppliers';
import { useAllDepartments } from '@/hooks/useDepartments';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useItems } from '@/hooks/useItems';
import { useAllUnits } from '@/hooks/useUnits';
import { useCreateDraftTransaction } from '@/hooks/useTransactions';
import { PageHeader, Button, Input, Select, Modal } from '@/components/ui';
import { PlusIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { type TransactionType } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createDraftTransactionFormSchema, type CreateDraftTransactionFormFormData } from '@/schemas/transactions.schema';
import { formatNumber } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { showSuccess, showError, showWarning } from '@/utils/toast';

interface LineItem {
  item_id: number;
  quantity: number;
  unit_code: string;
}

export default function CreateTransactionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [currentLine, setCurrentLine] = useState<Partial<LineItem>>({});

  const { data: suppliersData } = useAllSuppliers();
  const { data: departmentsData } = useAllDepartments();
  const { data: warehousesData } = useAllWarehouses();
  const { data: itemsData } = useItems(1, 200);
  const { data: unitsData } = useAllUnits();
  const createMutation = useCreateDraftTransaction();

  const suppliers = suppliersData?.data || [];
  const departments = departmentsData?.data || [];
  const warehouses = warehousesData?.data || [];
  const items = itemsData?.data || [];
  const units = unitsData?.data || [];

  const { register, handleSubmit, watch, formState: { errors } } = useForm<CreateDraftTransactionFormFormData>({
    resolver: zodResolver(createDraftTransactionFormSchema),
    defaultValues: {
      header: { type: 'RV', warehouse_id: undefined as any },
    },
  });

  const transactionType = watch('header.type');

  const addLineItem = () => {
    if (!currentLine.item_id || !currentLine.quantity || !currentLine.unit_code) {
      showError(t('transaction.fillRequired'));
      return;
    }
    setLineItems([...lineItems, currentLine as LineItem]);
    setCurrentLine({});
    setShowItemPicker(false);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: CreateDraftTransactionFormFormData) => {
    console.log('Form data:', data);
    if (lineItems.length === 0) {
      showError(t('transaction.addAtLeastOne'));
      return;
    }

    const response = await createMutation.mutateAsync({
      header: data.header,
      details: lineItems,
    });
    console.log('API response:', response);
  };

  const onError = (formErrors: any) => {
    console.error('Form validation errors:', formErrors);
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
            <Select
              label={`${t('form.warehouse')} *`}
              {...register('header.warehouse_id')}
              error={errors.header?.warehouse_id?.message}
              placeholder={t('form.selectWarehouse')}
              options={warehouses.map((w: any) => ({ value: w.id, label: getLocalizedName(w) }))}
            />
            <Select
              label={t('form.supplier')}
              {...register('header.supplier_id')}
              placeholder={t('form.selectSupplier')}
              options={suppliers.map((s: any) => ({ value: s.id, label: getLocalizedName(s) }))}
            />
            {transactionType === 'LN' && (
              <Select
                label={`${t('form.department')} *`}
                {...register('header.department_id')}
                placeholder={t('form.selectDepartment')}
                options={departments.map((d: any) => ({ value: d.id || d.code, label: getLocalizedName(d) }))}
              />
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
                    <td colSpan={3}></td>
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
            onChange={(e) => setCurrentLine({ ...currentLine, item_id: Number(e.target.value) })}
            placeholder={t('form.selectItem')}
            options={items.map((i: any) => ({ value: i.id, label: `${i.item_code} - ${getLocalizedName(i)} (${t('table.balance')}: ${i.current_balance})` }))}
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
              placeholder={t('form.selectUnit')}
              options={units.map((u: any) => ({ value: u.code, label: `${u.code} (${getLocalizedName(u)})` }))}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setShowItemPicker(false); setCurrentLine({}); }}>{t('common.cancel')}</Button>
            <Button type="button" onClick={addLineItem}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
