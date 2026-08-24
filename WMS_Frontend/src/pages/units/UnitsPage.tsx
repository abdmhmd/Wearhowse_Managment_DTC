import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUnits, useCreateUnit, useUpdateUnit } from '@/hooks/useUnits';
import { createUnitSchema, updateUnitSchema, type CreateUnitFormData, type UpdateUnitFormData } from '@/schemas/units.schema';
import { PageHeader, Button, DataTable, Modal, Input } from '@/components/ui';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Unit } from '@/types';

export default function UnitsPage() {
  const { t } = useTranslation();
  const { can } = useAuthStore();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  const { data, isLoading } = useUnits(page);
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();

  const createForm = useForm<CreateUnitFormData>({ resolver: zodResolver(createUnitSchema) });
  const updateForm = useForm<UpdateUnitFormData>({ resolver: zodResolver(updateUnitSchema) });

  const handleCreate = async (data: CreateUnitFormData) => {
    await createMutation.mutateAsync(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (data: UpdateUnitFormData) => {
    if (!editingUnit) return;
    await updateMutation.mutateAsync({ code: editingUnit.code, data });
    setEditingUnit(null);
    updateForm.reset();
  };

  const columns = [
    { key: 'code', header: t('table.code') },
    { key: 'name_ar', header: t('table.nameAr'), render: (item: Unit) => getLocalizedName(item) },
    { key: 'name_en', header: t('table.nameEn') },
    { key: 'created_at', header: t('table.created'), render: (item: Unit) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Unit) => (
        <div className="flex justify-end gap-2">
          {can('units:update') && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingUnit(item); updateForm.reset({ name_ar: item.name_ar, name_en: item.name_en }); }}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('pages.units.title')} subtitle={t('pages.units.subtitle')} actions={can('units:create') ? <Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.units.create')}</Button> : undefined} />
      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.units.create')}>
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          <Input label={t('form.code')} {...createForm.register('code')} error={createForm.formState.errors.code?.message} />
          <Input label={t('form.nameAr')} {...createForm.register('name_ar')} error={createForm.formState.errors.name_ar?.message} />
          <Input label={t('form.nameEn')} {...createForm.register('name_en')} error={createForm.formState.errors.name_en?.message} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); createForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={createMutation.isPending}>{t('common.create')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editingUnit} onClose={() => { setEditingUnit(null); updateForm.reset(); }} title={t('pages.units.edit')}>
        <form onSubmit={updateForm.handleSubmit(handleUpdate)} className="space-y-4">
          <Input label={t('form.nameAr')} {...updateForm.register('name_ar')} error={updateForm.formState.errors.name_ar?.message} />
          <Input label={t('form.nameEn')} {...updateForm.register('name_en')} error={updateForm.formState.errors.name_en?.message} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setEditingUnit(null); updateForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={updateMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
