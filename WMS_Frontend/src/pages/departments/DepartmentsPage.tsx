import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from '@/hooks/useDepartments';
import { createDepartmentSchema, updateDepartmentSchema, type CreateDepartmentFormData, type UpdateDepartmentFormData } from '@/schemas/departments.schema';
import { PageHeader, Button, DataTable, Modal, Input, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import type { Department } from '@/types';

export default function DepartmentsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);

  const { data } = useDepartments(page);
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();

  const createForm = useForm<CreateDepartmentFormData>({ resolver: zodResolver(createDepartmentSchema) });
  const updateForm = useForm<UpdateDepartmentFormData>({ resolver: zodResolver(updateDepartmentSchema) });

  const handleCreate = async (data: CreateDepartmentFormData) => {
    await createMutation.mutateAsync(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (data: UpdateDepartmentFormData) => {
    if (!editingDept) return;
    await updateMutation.mutateAsync({ code: editingDept.code, data });
    setEditingDept(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingDept) return;
    await deleteMutation.mutateAsync(deletingDept.code);
    setDeletingDept(null);
  };

  const columns = [
    { key: 'code', header: t('table.code') },
    { key: 'name_ar', header: t('table.name'), render: (item: Department) => getLocalizedName(item) },
    { key: 'created_at', header: t('table.created'), render: (item: Department) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Department) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingDept(item); updateForm.reset({ name_ar: item.name_ar }); }}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingDept(item); }}>
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('pages.departments.title')} subtitle={t('pages.departments.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.departments.create')}</Button>} />
      <DataTable columns={columns} data={(data?.data || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.departments.create')}>
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          <Input label={t('form.code')} {...createForm.register('code')} error={createForm.formState.errors.code?.message} />
          <Input label={t('form.name')} {...createForm.register('name_ar')} error={createForm.formState.errors.name_ar?.message} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); createForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={createMutation.isPending}>{t('common.create')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editingDept} onClose={() => { setEditingDept(null); updateForm.reset(); }} title={t('pages.departments.edit')}>
        <form onSubmit={updateForm.handleSubmit(handleUpdate)} className="space-y-4">
          <Input label={t('form.name')} {...updateForm.register('name_ar')} error={updateForm.formState.errors.name_ar?.message} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setEditingDept(null); updateForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={updateMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deletingDept} onClose={() => setDeletingDept(null)} onConfirm={handleDelete} title={t('common.confirmDelete')} message={t('common.confirmDeleteMessage', { name: getLocalizedName(deletingDept || {}) })} isLoading={deleteMutation.isPending} />
    </div>
  );
}
