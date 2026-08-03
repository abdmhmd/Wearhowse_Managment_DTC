import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem, useGenerateItemCode } from '@/hooks/useItems';
import { useCategories } from '@/hooks/useCategories';
import { useAllUnits } from '@/hooks/useUnits';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { createItemSchema, updateItemSchema, type CreateItemFormData, type UpdateItemFormData } from '@/schemas/items.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, ConfirmDialog, Badge } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon } from '@heroicons/react/24/outline';
import { formatNumber } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { Item } from '@/types';
import type { ItemsFilter } from '@/api/items.api';

export default function ItemsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ItemsFilter>({});
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  const { data } = useItems(page, 20, { ...filter, search: search || undefined });
  const { data: categoriesData } = useCategories(1, 200);
  const { data: unitsData } = useAllUnits();
  const { data: warehousesData } = useAllWarehouses();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const deleteMutation = useDeleteItem();
  const { data: generatedCode } = useGenerateItemCode(selectedCategory);

  const categories = categoriesData?.data || [];
  const units = unitsData?.data || [];
  const warehouses = warehousesData?.data || [];

  const createForm = useForm<CreateItemFormData>({
    resolver: zodResolver(createItemSchema),
    defaultValues: { min_stock_level: 0, max_stock_level: 999999.9999, opening_price: 0, is_consumable: true, expiry_alert_days: 30 },
  });
  const updateForm = useForm<UpdateItemFormData>({ resolver: zodResolver(updateItemSchema) });

  const handleCreate = async (formData: CreateItemFormData) => {
    await createMutation.mutateAsync(formData);
    setIsCreateOpen(false);
    createForm.reset();
    setSelectedCategory('');
  };

  const handleUpdate = async (formData: UpdateItemFormData) => {
    if (!editingItem) return;
    await updateMutation.mutateAsync({ id: editingItem.id, data: formData });
    setEditingItem(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    await deleteMutation.mutateAsync(deletingItem.id);
    setDeletingItem(null);
  };

  const columns = [
    { key: 'item_code', header: t('table.itemCode') },
    { key: 'name_ar', header: t('table.name') },
    { key: 'category_name', header: t('table.category'), render: (item: any) => getLocalizedName({ name_ar: item.category_name_ar, name_en: item.category_name_en }) || item.category_code },
    { key: 'unit_name', header: t('table.unit'), render: (item: any) => getLocalizedName({ name_ar: item.unit_name_ar, name_en: item.unit_name_en }) || item.unit_code },
    { key: 'warehouse_name', header: t('table.warehouse'), render: (item: any) => getLocalizedName({ name_ar: item.warehouse_name_ar, name_en: item.warehouse_name_en }) || `WH#${item.warehouse_id}` },
    {
      key: 'current_balance', header: t('table.balance'),
      render: (item: any) => {
        const isLow = item.current_balance <= item.min_stock_level;
        return (
          <span className={isLow ? 'text-red-600 font-semibold' : ''}>
            {formatNumber(item.current_balance)}
          </span>
        );
      },
    },
    {
      key: 'is_consumable', header: t('pages.items.itemType'),
      render: (item: any) => item.is_consumable === false
        ? <Badge variant="warning">{t('pages.items.durable')}</Badge>
        : <Badge variant="info">{t('pages.items.consumable')}</Badge>,
    },
    {
      key: 'expiry_alert_days', header: t('pages.items.expiryAlertDays'),
      render: (item: any) => (item.is_consumable === false ? formatNumber(item.expiry_alert_days) : '-'),
    },
    {
      key: 'is_active', header: t('table.status'),
      render: (item: any) => item.is_active !== false ? <Badge variant="success">{t('common.active')}</Badge> : <Badge variant="danger">{t('common.inactive')}</Badge>,
    },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/items/${item.id}`); }}>
            <EyeIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => {
            e.stopPropagation();
            setEditingItem(item);
            updateForm.reset({
              name_ar: item.name_ar, description: item.description || '',
              category_code: item.category_code, unit_code: item.unit_code, warehouse_id: item.warehouse_id,
              min_stock_level: item.min_stock_level, max_stock_level: item.max_stock_level,
              opening_price: item.opening_price || 0,
              location: item.location || '',
              is_consumable: item.is_consumable !== false,
              expiry_alert_days: item.expiry_alert_days || 30,
              sap_material_number: item.sap_material_number || '',
              gl_account: item.gl_account || '',
            });
          }}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingItem(item); }}>
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const CreateItemForm = ({ form, onSubmit, isLoading }: { form: any; onSubmit: any; isLoading: boolean }) => {
    const categoryValue = form.watch('category_code');

    useEffect(() => {
      setSelectedCategory(categoryValue || '');
    }, [categoryValue]);

    return (
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label={t('form.nameAr')} {...form.register('name_ar')} error={form.formState.errors.name_ar?.message} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.itemCode')}</label>
            <input
              value={generatedCode || ''}
              disabled
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>
        </div>
        <Input label={t('form.description')} {...form.register('description')} />
        <div className="grid grid-cols-3 gap-4">
          <Select
            label={t('form.category')}
            {...form.register('category_code')}
            error={form.formState.errors.category_code?.message}
            placeholder={t('form.selectCategory')}
            options={categories.map((c: any) => ({ value: c.code, label: getLocalizedName(c) }))}
          />
          <Select
            label={t('form.unit')}
            {...form.register('unit_code')}
            error={form.formState.errors.unit_code?.message}
            placeholder={t('form.selectUnit')}
            options={units.map((u: any) => ({ value: u.code, label: `${u.code} (${getLocalizedName(u)})` }))}
          />
          <Select
            label={t('form.warehouse')}
            {...form.register('warehouse_id')}
            error={form.formState.errors.warehouse_id?.message}
            placeholder={t('form.selectWarehouse')}
            options={warehouses.map((w: any) => ({ value: w.id, label: getLocalizedName(w) }))}
          />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Input label={t('form.minStockLevel')} type="number" step="0.0001" {...form.register('min_stock_level')} />
          <Input label={t('form.maxStockLevel')} type="number" step="0.0001" {...form.register('max_stock_level')} />
          <Input label={t('form.openingPrice')} type="number" step="0.01" {...form.register('opening_price')} />
          <Input label={t('form.location')} {...form.register('location')} />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mt-5">
              <input type="checkbox" {...form.register('is_consumable')} className="rounded border-gray-300" />
              {t('pages.items.consumable')}
            </label>
          </div>
          <Input label={t('pages.items.expiryAlertDays')} type="number" step="1" {...form.register('expiry_alert_days')} />
          <Input label={t('pages.items.sapMaterialNumber')} {...form.register('sap_material_number')} />
          <Input label={t('pages.items.glAccount')} {...form.register('gl_account')} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingItem(null); form.reset(); setSelectedCategory(''); }}>{t('common.cancel')}</Button>
          <Button type="submit" isLoading={isLoading}>{t('common.save')}</Button>
        </div>
      </form>
    );
  };

  const EditItemForm = ({ form, onSubmit, isLoading }: { form: any; onSubmit: any; isLoading: boolean }) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label={t('form.nameAr')} {...form.register('name_ar')} error={form.formState.errors.name_ar?.message} />
      </div>
      <Input label={t('form.description')} {...form.register('description')} />
      <div className="grid grid-cols-3 gap-4">
        <Select
          label={t('form.category')}
          {...form.register('category_code')}
          error={form.formState.errors.category_code?.message}
          placeholder={t('form.selectCategory')}
          options={categories.map((c: any) => ({ value: c.code, label: getLocalizedName(c) }))}
        />
        <Select
          label={t('form.unit')}
          {...form.register('unit_code')}
          error={form.formState.errors.unit_code?.message}
          placeholder={t('form.selectUnit')}
          options={units.map((u: any) => ({ value: u.code, label: `${u.code} (${getLocalizedName(u)})` }))}
        />
        <Select
          label={t('form.warehouse')}
          {...form.register('warehouse_id')}
          error={form.formState.errors.warehouse_id?.message}
          placeholder={t('form.selectWarehouse')}
          options={warehouses.map((w: any) => ({ value: w.id, label: getLocalizedName(w) }))}
        />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Input label={t('form.minStockLevel')} type="number" step="0.0001" {...form.register('min_stock_level')} />
        <Input label={t('form.maxStockLevel')} type="number" step="0.0001" {...form.register('max_stock_level')} />
        <Input label={t('form.openingPrice')} type="number" step="0.01" {...form.register('opening_price')} />
        <Input label={t('form.location')} {...form.register('location')} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mt-5">
            <input type="checkbox" {...form.register('is_consumable')} className="rounded border-gray-300" />
            {t('pages.items.consumable')}
          </label>
        </div>
        <Input label={t('pages.items.expiryAlertDays')} type="number" step="1" {...form.register('expiry_alert_days')} />
        <Input label={t('pages.items.sapMaterialNumber')} {...form.register('sap_material_number')} />
        <Input label={t('pages.items.glAccount')} {...form.register('gl_account')} />
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingItem(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={isLoading}>{t('common.save')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.items.title')} subtitle={t('pages.items.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.items.create')}</Button>} />

      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-64"
        />
        <select
          value={filter.category_code || ''}
          onChange={(e) => { setFilter({ ...filter, category_code: e.target.value || undefined }); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')} {t('table.category')}</option>
          {categories.map((c: any) => <option key={c.code} value={c.code}>{getLocalizedName(c)}</option>)}
        </select>
        <select
          value={filter.warehouse_id || ''}
          onChange={(e) => { setFilter({ ...filter, warehouse_id: e.target.value ? Number(e.target.value) : undefined }); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')} {t('table.warehouse')}</option>
          {warehouses.map((w: any) => <option key={w.id} value={w.id}>{getLocalizedName(w)}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={(data?.data || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); setSelectedCategory(''); }} title={t('pages.items.create')} size="lg">
        <CreateItemForm form={createForm} onSubmit={handleCreate} isLoading={createMutation.isPending} />
      </Modal>

      <Modal isOpen={!!editingItem} onClose={() => { setEditingItem(null); updateForm.reset(); }} title={t('pages.items.edit')} size="lg">
        <EditItemForm form={updateForm} onSubmit={handleUpdate} isLoading={updateMutation.isPending} />
      </Modal>

      <ConfirmDialog isOpen={!!deletingItem} onClose={() => setDeletingItem(null)} onConfirm={handleDelete} title={t('common.delete')} message={`${t('common.confirmDelete')} "${getLocalizedName(deletingItem)}"?`} isLoading={deleteMutation.isPending} />
    </div>
  );
}
