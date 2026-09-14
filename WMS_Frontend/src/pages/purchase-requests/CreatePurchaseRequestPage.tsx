import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCreatePurchaseRequest } from '@/hooks/useCreatePurchaseRequest';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, Input, Select, SearchableSelect } from '@/components/ui';
import ItemPickerModal from '@/components/pickers/ItemPickerModal';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { getLocalizedName } from '@/i18n/helpers';

interface LineDraft {
  item_id: string;
  item_label: string;
  quantity: string;
  unit_code: string;
  notes: string;
}

const emptyLine: LineDraft = { item_id: '', item_label: '', quantity: '', unit_code: '', notes: '' };

export default function CreatePurchaseRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, can } = useAuthStore();
  const createMutation = useCreatePurchaseRequest();

  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
  const [error, setError] = useState('');
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  // Warehouse picker: the request must target a main warehouse of the user's
  // department. The backend enforces this authoritatively.
  const { data: warehousesData } = useAllWarehouses(can('warehouses:view') || can('purchase-requests:create'));
  const allWarehouses = warehousesData?.items || [];
  const mainWarehouses = allWarehouses.filter((w: any) => w.is_main).filter((w: any) =>
    user?.department_id != null ? w.department_id === user.department_id : true
  );

  const warehouseOptions = mainWarehouses.map((w: any) => ({
    value: String(w.id),
    label: `${w.code} — ${getLocalizedName(w)}`,
    sublabel: w.department_name_ar || w.department_name_en
      ? getLocalizedName({ name_ar: w.department_name_ar, name_en: w.department_name_en })
      : undefined,
  }));

  const setLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handlePickedItems = (items: any[]) => {
    if (pickerIndex == null || items.length === 0) return;
    const item = items[0];
    setLine(pickerIndex, {
      item_id: String(item.id),
      unit_code: item.unit_code ?? '',
      item_label: `${item.item_code} — ${getLocalizedName({ name_ar: item.name_ar, name_en: item.name_en })}`,
    });
  };

  const linesValid =
    lines.length > 0 &&
    lines.every((l) => l.item_id && Number(l.quantity) > 0 && l.unit_code) &&
    new Set(lines.map((l) => l.item_id)).size === lines.length;

  const canSubmit = !!warehouseId && linesValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    try {
      await createMutation.mutateAsync({
        warehouse_id: Number(warehouseId),
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
          unit_code: l.unit_code,
          notes: l.notes.trim() || null,
        })),
      });
      navigate('/purchase-requests');
    } catch { /* toast already shown */ }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title={t('pages.purchaseRequests.create')}
        subtitle={t('pages.purchaseRequests.subtitle')}
      />

      {/* Request information */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">{t('pages.purchaseRequests.details')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pr-warehouse" className="block text-sm font-medium text-gray-700 mb-1">
              {t('pages.purchaseRequests.warehouse')}
            </label>
            <SearchableSelect
              id="pr-warehouse"
              aria-label={t('pages.purchaseRequests.warehouse')}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v === null ? '' : String(v))}
              options={warehouseOptions}
              placeholder={t('components.warehousePicker.placeholder')}
              searchPlaceholder={t('components.warehousePicker.searchPlaceholder')}
              emptyMessage={t('components.warehousePicker.emptyMessage')}
            />
          </div>
          <Input id="pr-notes" label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">{t('pages.purchaseRequests.items')}</h3>
          <Button variant="secondary" onClick={() => setLines([...lines, { ...emptyLine }])}>
            <PlusIcon className="h-4 w-4 me-1" />
            {t('pages.purchaseRequests.addItem')}
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-5">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t('pages.purchaseRequests.item')}</span>
                <button
                  type="button"
                  id={`pr-item-${index}`}
                  aria-label={t('pages.purchaseRequests.item')}
                  onClick={() => setPickerIndex(index)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm text-left focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {line.item_label || (
                    <span className="text-gray-400">{t('pages.purchaseRequests.selectItem')}</span>
                  )}
                </button>
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input type="number" min="0" step="any" id={`pr-qty-${index}`} label={t('pages.purchaseRequests.quantity')}
                  value={line.quantity}
                  onChange={(e) => setLine(index, { quantity: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Select label={t('pages.purchaseRequests.unit')} id={`pr-unit-${index}`} value={line.unit_code} disabled
                  onChange={() => undefined}
                  options={line.unit_code
                    ? [{ value: line.unit_code, label: line.unit_code }]
                    : [{ value: '', label: t('common.select') }]} />
              </div>
              <div className="col-span-8 md:col-span-2">
                <Input id={`pr-line-${index}-notes`} label={t('pages.purchaseRequests.notes')} value={line.notes}
                  onChange={(e) => setLine(index, { notes: e.target.value })} />
              </div>
              <div className="col-span-3 md:col-span-1">
                <button
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  className="w-full flex items-center justify-center gap-1 px-2 py-2 text-sm text-red-600 rounded hover:bg-red-50 disabled:opacity-30"
                  title={t('pages.purchaseRequests.removeItem')}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={() => navigate('/purchase-requests')}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending ? t('common.saving') : t('pages.purchaseRequests.create')}
        </Button>
      </div>

      <ItemPickerModal
        isOpen={pickerIndex !== null}
        onClose={() => setPickerIndex(null)}
        mode="single"
        title={t('pages.purchaseRequests.selectItem')}
        warehouseId={warehouseId ? Number(warehouseId) : null}
        excludeIds={lines
          .map((l) => l.item_id)
          .filter((id, i) => id && i !== pickerIndex)
          .map(Number)}
        onSelect={handlePickedItems}
      />
    </div>
  );
}