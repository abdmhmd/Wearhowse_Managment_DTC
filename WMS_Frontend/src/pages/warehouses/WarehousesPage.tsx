import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useWarehouses,
  useAllWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
} from '@/hooks/useWarehouses';
import { useAllDepartments } from '@/hooks/useDepartments';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  type CreateWarehouseFormData,
  type UpdateWarehouseFormData,
} from '@/schemas/warehouses.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge } from '@/components/ui';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import type { Warehouse } from '@/types';
import type { WarehouseListFilter } from '@/api/warehouses.api';

export default function WarehousesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWH, setEditingWH] = useState<Warehouse | null>(null);

  const filter = useMemo<WarehouseListFilter>(
    () => ({
      department_id: filterDept ? Number(filterDept) : undefined,
      is_main: filterType === 'main' ? true : filterType === 'sub' ? false : undefined,
    }),
    [filterDept, filterType]
  );

  const { data } = useWarehouses(page, 20, filter);
  const { data: allWarehousesData } = useAllWarehouses();
  const { data: departmentsData } = useAllDepartments();
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();

  const createForm = useForm<CreateWarehouseFormData>({
    resolver: zodResolver(createWarehouseSchema),
    defaultValues: { code: '', name_ar: '', location: '', is_main: false },
  });
  const updateForm = useForm<UpdateWarehouseFormData>({ resolver: zodResolver(updateWarehouseSchema) });

  const departmentOptions = (departmentsData?.items || []).map((d) => ({ value: d.id as number, label: getLocalizedName(d) }));
  const formDepartmentOptions = [{ value: '', label: t('pages.warehouses.noDepartment') }, ...departmentOptions];
  const typeFilterOptions = [
    { value: 'main', label: t('pages.warehouses.typeMain') },
    { value: 'sub', label: t('pages.warehouses.typeSub') },
  ];

  const allWarehouseRows = (allWarehousesData?.items || []) as Warehouse[];

  const hasMainConflict = (departmentId: number, excludeId?: number) =>
    allWarehouseRows.some((w) => w.department_id === departmentId && w.is_main && w.id !== excludeId);

  const handleCreate = async (data: CreateWarehouseFormData) => {
    if (data.is_main && data.department_id != null && hasMainConflict(data.department_id)) {
      createForm.setError('is_main', { message: t('pages.warehouses.errors.MAIN_WAREHOUSE_EXISTS') });
      return;
    }
    await createMutation.mutateAsync(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (data: UpdateWarehouseFormData) => {
    if (!editingWH) return;
    const departmentId = data.department_id ?? editingWH.department_id;
    if (data.is_main && departmentId != null && hasMainConflict(departmentId, editingWH.id)) {
      updateForm.setError('is_main', { message: t('pages.warehouses.errors.MAIN_WAREHOUSE_EXISTS') });
      return;
    }
    await updateMutation.mutateAsync({ id: editingWH.id, data });
    setEditingWH(null);
    updateForm.reset();
  };

  const columns = [
    { key: 'code', header: t('table.code') },
    { key: 'name_ar', header: t('table.name'), render: (item: Warehouse) => getLocalizedName(item) },
    {
      key: 'department_id', header: t('pages.warehouses.department'),
      render: (item: Warehouse) => {
        const hasName = !!(item.department_name_ar || item.department_name_en);
        const name = hasName
          ? getLocalizedName({ name_ar: item.department_name_ar ?? undefined, name_en: item.department_name_en ?? undefined })
          : null;
        return name ? <span>{name}</span> : <span className="text-gray-400">—</span>;
      },
    },
    {
      key: 'is_main', header: t('pages.warehouses.type'),
      render: (item: Warehouse) =>
        item.is_main ? (
          <Badge variant="success">{t('pages.warehouses.typeMain')}</Badge>
        ) : (
          <Badge>{t('pages.warehouses.typeSub')}</Badge>
        ),
    },
    { key: 'created_at', header: t('table.created'), render: (item: Warehouse) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Warehouse) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditingWH(item);
              updateForm.reset({
                code: item.code,
                name_ar: item.name_ar,
                location: item.location || '',
                department_id: (item.department_id != null ? item.department_id : '') as number | null,
                is_main: !!item.is_main,
              });
            }}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const renderForm = (form: any, onSubmit: any) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Input id="wh-code" label={t('form.code')} {...form.register('code')} error={form.formState.errors.code?.message} />
      <Input id="wh-name" label={t('form.name')} {...form.register('name_ar')} error={form.formState.errors.name_ar?.message} />
      <Input id="wh-location" label={t('form.location')} {...form.register('location')} />
      <Select
        id="wh-department"
        label={t('pages.warehouses.department')}
        {...form.register('department_id')}
        options={formDepartmentOptions}
      />
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <input
            id="wh-is-main"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...form.register('is_main')}
          />
          <label htmlFor="wh-is-main" className="text-sm font-medium text-gray-700">
            {t('pages.warehouses.isMain')}
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('pages.warehouses.isMainHelp')}</p>
        {form.formState.errors.is_main?.message && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.is_main.message}</p>
        )}
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingWH(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>{t('common.save')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.warehouses.title')} subtitle={t('pages.warehouses.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.warehouses.create')}</Button>} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            id="wh-filter-department"
            label={t('pages.warehouses.filterByDepartment')}
            value={filterDept}
            onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}
            options={departmentOptions}
            placeholder={t('common.all')}
          />
        </div>
        <div className="w-56">
          <Select
            id="wh-filter-type"
            label={t('pages.warehouses.filterByType')}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            options={typeFilterOptions}
            placeholder={t('common.all')}
          />
        </div>
      </div>

      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.warehouses.create')}>
        {renderForm(createForm, handleCreate)}
      </Modal>

      <Modal isOpen={!!editingWH} onClose={() => { setEditingWH(null); updateForm.reset(); }} title={t('pages.warehouses.edit')}>
        {renderForm(updateForm, handleUpdate)}
      </Modal>
    </div>
  );
}