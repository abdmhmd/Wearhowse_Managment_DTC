import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse } from '@/hooks/useWarehouses';
import { createWarehouseSchema, updateWarehouseSchema, type CreateWarehouseFormData, type UpdateWarehouseFormData } from '@/schemas/warehouses.schema';
import { PageHeader, Button, DataTable, Modal, Input, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import type { Warehouse } from '@/types';

export default function WarehousesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWH, setEditingWH] = useState<Warehouse | null>(null);
  const [deletingWH, setDeletingWH] = useState<Warehouse | null>(null);

  const { data } = useWarehouses(page);
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();
  const deleteMutation = useDeleteWarehouse();

  const createForm = useForm<CreateWarehouseFormData>({ resolver: zodResolver(createWarehouseSchema) });
  const updateForm = useForm<UpdateWarehouseFormData>({ resolver: zodResolver(updateWarehouseSchema) });

  const handleCreate = async (data: CreateWarehouseFormData) => {
    await createMutation.mutateAsync(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (data: UpdateWarehouseFormData) => {
    if (!editingWH) return;
    await updateMutation.mutateAsync({ id: editingWH.id, data });
    setEditingWH(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingWH) return;
    await deleteMutation.mutateAsync(deletingWH.id);
    setDeletingWH(null);
  };

  const columns = [
    { key: 'code', header: t('table.code') },
    { key: 'name_ar', header: t('table.name'), render: (item: Warehouse) => getLocalizedName(item) },
    { key: 'location', header: t('table.location'), render: (item: Warehouse) => <span className="text-gray-500">{item.location || '-'}</span> },
    { key: 'created_at', header: t('table.created'), render: (item: Warehouse) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Warehouse) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingWH(item); updateForm.reset({ code: item.code, name_ar: item.name_ar, location: item.location || '' }); }}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingWH(item); }}>
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const renderForm = (form: any, onSubmit: any) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Input label={t('form.code')} {...form.register('code')} error={form.formState.errors.code?.message} />
      <Input label={t('form.name')} {...form.register('name_ar')} error={form.formState.errors.name_ar?.message} />
      <Input label={t('form.location')} {...form.register('location')} />
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingWH(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>{t('common.save')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.warehouses.title')} subtitle={t('pages.warehouses.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.warehouses.create')}</Button>} />
      <DataTable columns={columns} data={(data?.data || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.warehouses.create')}>
        {renderForm(createForm, handleCreate)}
      </Modal>

      <Modal isOpen={!!editingWH} onClose={() => { setEditingWH(null); updateForm.reset(); }} title={t('pages.warehouses.edit')}>
        {renderForm(updateForm, handleUpdate)}
      </Modal>

      <ConfirmDialog isOpen={!!deletingWH} onClose={() => setDeletingWH(null)} onConfirm={handleDelete} title={t('common.confirmDelete')} message={t('common.confirmDeleteMessage', { name: getLocalizedName(deletingWH || {}) })} isLoading={deleteMutation.isPending} />
    </div>
  );
}
