import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSuppliers, useCreateSupplier, useUpdateSupplier } from '@/hooks/useSuppliers';
import { createSupplierSchema, updateSupplierSchema, type CreateSupplierFormData, type UpdateSupplierFormData } from '@/schemas/suppliers.schema';
import { PageHeader, Button, DataTable, Modal, Input } from '@/components/ui';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Supplier } from '@/types';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { can } = useAuthStore();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const { data, isLoading } = useSuppliers(page);
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();

  const createForm = useForm<CreateSupplierFormData>({ resolver: zodResolver(createSupplierSchema) });
  const updateForm = useForm<UpdateSupplierFormData>({ resolver: zodResolver(updateSupplierSchema) });

  const handleCreate = async (data: CreateSupplierFormData) => {
    await createMutation.mutateAsync(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (data: UpdateSupplierFormData) => {
    if (!editingSupplier) return;
    await updateMutation.mutateAsync({ id: editingSupplier.id, data });
    setEditingSupplier(null);
    updateForm.reset();
  };

  const columns = [
    { key: 'id', header: t('table.id') },
    { key: 'name_ar', header: t('table.name'), render: (item: Supplier) => getLocalizedName(item) },
    { key: 'phone', header: t('table.phone'), render: (item: Supplier) => <span className="text-gray-500">{item.phone || '-'}</span> },
    { key: 'email', header: t('table.email'), render: (item: Supplier) => <span className="text-gray-500">{item.email || '-'}</span> },
    { key: 'created_at', header: t('table.created'), render: (item: Supplier) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Supplier) => (
        <div className="flex justify-end gap-2">
          {can('suppliers:update') && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingSupplier(item); updateForm.reset({ name_ar: item.name_ar, phone: item.phone || '', email: item.email || '', address: item.address || '' }); }}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const renderForm = (form: any, onSubmit: any) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Input label={t('form.name')} {...form.register('name_ar')} error={form.formState.errors.name_ar?.message} />
      <Input label={t('form.phone')} {...form.register('phone')} error={form.formState.errors.phone?.message} />
      <Input label={t('form.email')} type="email" {...form.register('email')} error={form.formState.errors.email?.message} />
      <Input label={t('form.address')} {...form.register('address')} />
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingSupplier(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>{t('common.save')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.suppliers.title')} subtitle={t('pages.suppliers.subtitle')} actions={can('suppliers:create') ? <Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.suppliers.create')}</Button> : undefined} />
      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.suppliers.create')}>
        {renderForm(createForm, handleCreate)}
      </Modal>

      <Modal isOpen={!!editingSupplier} onClose={() => { setEditingSupplier(null); updateForm.reset(); }} title={t('pages.suppliers.edit')}>
        {renderForm(updateForm, handleUpdate)}
      </Modal>
    </div>
  );
}
