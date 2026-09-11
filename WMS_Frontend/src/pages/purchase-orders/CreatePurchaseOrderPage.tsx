import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCreatePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { useItems } from '@/hooks/useItems';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuthStore } from '@/store/auth.store';
import api from '@/api/client';
import { PageHeader, Button, Input, Select } from '@/components/ui';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { getLocalizedName } from '@/i18n/helpers';

interface LineDraft {
  item_id: string;
  quantity_ordered: string;
  unit_code: string;
  unit_price: string;
}

const emptyLine: LineDraft = { item_id: '', quantity_ordered: '', unit_code: '', unit_price: '' };

export default function CreatePurchaseOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, can } = useAuthStore();
  const createMutation = useCreatePurchaseOrder();

  // ── Role-aware creation ────────────────────────────────────────────────────
  // sub_warehouse_manager = pure MATERIAL REQUEST (item/quantity/unit/notes);
  // the receiving main warehouse is derived SERVER-SIDE and only displayed.
  // admin keeps full procurement control (supplier, price, warehouse).
  const isManager = user?.role === 'sub_warehouse_manager';

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
  const [error, setError] = useState('');

  // Lookups (both roles may read these catalogs).
  const canLoadLookups = can('warehouses:view') || isManager;
  const { data: warehousesData } = useAllWarehouses(!!canLoadLookups);
  const allWarehouses = warehousesData?.items || [];
  const mainWarehouses = allWarehouses
    .filter((w: any) => w.is_main)
    .filter((w: any) => (isManager ? (user?.warehouse_ids ?? []).includes(w.id) : true));

  const { data: itemsData } = useItems(1, 500);
  const items = itemsData?.items || [];

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', 'po-picker'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 200 } });
      return res.data.data;
    },
    enabled: !isManager,
  });
  const suppliers = suppliersData?.items || [];

  const { data: unitsData } = useQuery({
    queryKey: ['units', 'po-picker'],
    queryFn: async () => {
      const res = await api.get('/units', { params: { limit: 100 } });
      return res.data.data;
    },
    enabled: canLoadLookups,
  });
  const units = unitsData?.items || [];

  // ── WM derivation (DISPLAY ONLY — the backend remains authoritative) ──────
  const { data: departmentsData } = useDepartments(1, 200, isManager && !!user?.department_id);
  const departments = departmentsData?.items || [];
  const myDepartment = user?.department_id != null
    ? departments.find((d: any) => d.id === user.department_id)
    : undefined;

  const deptMain = user?.department_id != null
    ? allWarehouses.find((w: any) => w.is_main && w.department_id === user.department_id)
    : undefined;
  const assignedMains = mainWarehouses.filter((w: any) => !w.department_id || w.department_id === user?.department_id || true);
  void assignedMains;
  const myAssignedMains = allWarehouses.filter(
    (w: any) => w.is_main && (user?.warehouse_ids ?? []).includes(w.id)
  );
  const derivedWarehouse = deptMain ?? (myAssignedMains.length === 1 ? myAssignedMains[0] : undefined);
  const ambiguousWarehouse = !deptMain && myAssignedMains.length > 1;

  const selectedWarehouse = mainWarehouses.find((w: any) => String(w.id) === warehouseId);

  const warehouseOptions = [
    { value: '', label: t('common.select') },
    ...mainWarehouses.map((w: any) => ({
      value: String(w.id),
      label: getLocalizedName(w) || w.code || String(w.id),
    })),
  ];
  const supplierOptions = [
    { value: '', label: '-' },
    ...suppliers.map((s: any) => ({ value: String(s.id), label: getLocalizedName(s) })),
  ];
  const itemOptions = [
    { value: '', label: t('common.select') },
    ...items.map((it: any) => ({ value: String(it.id), label: `${it.item_code} — ${getLocalizedName(it)}` })),
  ];
  const unitOptions = [
    { value: '', label: t('common.select') },
    ...units.map((u: any) => ({ value: u.code, label: getLocalizedName(u) })),
  ];

  const setLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handleItemChange = (index: number, itemIdStr: string) => {
    const item = items.find((it: any) => String(it.id) === itemIdStr);
    setLine(index, { item_id: itemIdStr, unit_code: item ? item.unit_code : '' });
  };

  const validate = (): string => {
    if (isManager) {
      if (!derivedWarehouse) return t('pages.purchaseOrders.noValidWarehouseWarning');
    } else {
      if (!warehouseId) return t('pages.purchaseOrders.validation.warehouseRequired');
      if (!selectedWarehouse) return t('pages.purchaseOrders.validation.warehouseNotEligible');
    }
    for (const l of lines) {
      if (!l.item_id) return t('pages.purchaseOrders.validation.itemRequired');
      if (!l.quantity_ordered || Number(l.quantity_ordered) <= 0) return t('pages.purchaseOrders.validation.quantityPositive');
      if (!l.unit_code) return t('pages.purchaseOrders.validation.unitRequired');
      if (lines.filter((x) => x.item_id === l.item_id).length > 1) return t('pages.purchaseOrders.validation.duplicateItem');
    }
    return '';
  };

  const buildLines = () =>
    lines.map((l) => ({
      item_id: Number(l.item_id),
      quantity_ordered: Number(l.quantity_ordered),
      unit_code: l.unit_code,
      ...(isManager ? {} : { unit_price: l.unit_price ? Number(l.unit_price) : undefined }),
    }));

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError('');
    try {
      await createMutation.mutateAsync({
        notes: notes || null,
        lines: buildLines(),
        // Manager payload carries ONLY request data; procurement fields are
        // derived server-side and never sent.
        ...(isManager
          ? { expected_date: expectedDate || null }
          : {
            supplier_id: supplierId ? Number(supplierId) : null,
            warehouse_id: Number(warehouseId),
            expected_date: expectedDate || null,
          }),
      });
      navigate('/purchase-orders');
    } catch { /* toast already shown by the hook */ }
  };

  const title = isManager ? t('pages.purchaseOrders.requestTitle') : t('pages.purchaseOrders.createTitle');

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title={title} subtitle={t('pages.purchaseOrders.subtitle')} />

      {/* SECTION 1 — Request information */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">
          {isManager ? t('pages.purchaseOrders.requestInfoSection') : t('pages.purchaseOrders.orderInfo')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isManager ? (
            <>
              {/* Read-only, automatically derived context */}
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-1">{t('pages.purchaseOrders.departmentLabel')}</p>
                <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                  {myDepartment ? getLocalizedName(myDepartment) : (user?.department_id ?? '-')}
                </p>
              </div>
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-1">{t('pages.purchaseOrders.receivingWarehouse')}</p>
                <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                  {derivedWarehouse
                    ? getLocalizedName(derivedWarehouse) || derivedWarehouse.code
                    : t('common.notFound')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('pages.purchaseOrders.warehouseAutoHint')}</p>
              </div>
              {(ambiguousWarehouse || (!derivedWarehouse)) && (
                <div className="md:col-span-2 text-sm text-red-600">
                  {ambiguousWarehouse
                    ? t('pages.purchaseOrders.ambiguousWarehouseWarning')
                    : t('pages.purchaseOrders.noValidWarehouseWarning')}
                </div>
              )}
              <Input label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </>
          ) : (
            <>
              <Select label={t('pages.purchaseOrders.receivingWarehouse')} value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)} options={warehouseOptions} />
              <Select label={t('pages.purchaseOrders.supplier')} value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)} options={supplierOptions} />
              <Input type="date" label={t('pages.purchaseOrders.expectedDate')} value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)} />
              <Input type="date" label={t('pages.purchaseOrders.expectedDate')} value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)} />
              <Input label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {/* SECTION 2 — Materials */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">
            {isManager ? t('pages.purchaseOrders.requestedItems') : t('pages.purchaseOrders.lines')}
          </h3>
          <Button variant="secondary" onClick={() => setLines([...lines, { ...emptyLine }])}>
            <PlusIcon className="h-4 w-4 me-1" />
            {isManager ? t('pages.purchaseOrders.addItem') : t('common.add')}
          </Button>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-end">
              <div className={isManager ? 'col-span-12 md:col-span-6' : 'col-span-12 md:col-span-5'}>
                <Select label={isManager ? t('pages.purchaseOrders.itemLabel') : t('pages.items.title')} value={line.item_id}
                  onChange={(e) => handleItemChange(index, e.target.value)}
                  options={itemOptions} />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input type="number" min="0" step="any" label={isManager ? t('pages.purchaseOrders.quantityRequested') : t('pages.purchaseOrders.quantityOrdered')}
                  value={line.quantity_ordered}
                  onChange={(e) => setLine(index, { quantity_ordered: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Select label={t('pages.purchaseOrders.unit')} value={line.unit_code} disabled
                  onChange={() => undefined} options={unitOptions} />
              </div>
              {!isManager && (
                <div className="col-span-3 md:col-span-2">
                  <Input type="number" min="0" step="any" label={t('pages.purchaseOrders.unitPrice')}
                    value={line.unit_price} onChange={(e) => setLine(index, { unit_price: e.target.value })} />
                </div>
              )}
              <div className={isManager ? 'col-span-4 md:col-span-2' : 'col-span-1'} >
                <button
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  className="w-full flex items-center justify-center gap-1 px-2 py-2 text-sm text-red-600 rounded hover:bg-red-50 disabled:opacity-30"
                  title={t('pages.purchaseOrders.removeItem')}
                >
                  <TrashIcon className="h-4 w-4" />
                  {isManager ? t('pages.purchaseOrders.removeItem') : ''}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isManager && selectedWarehouse && (
        <p className="text-sm text-gray-500">{t('pages.purchaseOrders.receiveIntoHint', { warehouse: getLocalizedName(selectedWarehouse) || selectedWarehouse.code })}</p>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={() => navigate('/purchase-orders')}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending
            ? t('common.saving')
            : isManager ? t('pages.purchaseOrders.submitRequest') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
