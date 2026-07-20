import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUnitConversions, useCreateUnitConversion, useUpdateUnitConversion, useDeleteUnitConversion } from '@/hooks/useUnitConversions';
import { useItems } from '@/hooks/useItems';
import { useAllUnits } from '@/hooks/useUnits';
import { createUnitConversionSchema, updateUnitConversionSchema, type CreateUnitConversionFormData, type UpdateUnitConversionFormData } from '@/schemas/unit-conversions.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { UnitConversion } from '@/types';

export default function UnitConversionsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUC, setEditingUC] = useState<UnitConversion | null>(null);
  const [deletingUC, setDeletingUC] = useState<UnitConversion | null>(null);

  const { data } = useUnitConversions(page);
  const { data: itemsData } = useItems(1, 200);
  const { data: unitsData } = useAllUnits();
  const createMutation = useCreateUnitConversion();
  const updateMutation = useUpdateUnitConversion();
  const deleteMutation = useDeleteUnitConversion();

  const items = itemsData?.data || [];
  const units = unitsData?.data || [];

  const createForm = useForm<CreateUnitConversionFormData>({ resolver: zodResolver(createUnitConversionSchema) });
  const updateForm = useForm<UpdateUnitConversionFormData>({ resolver: zodResolver(updateUnitConversionSchema) });

  const handleCreate = async (formData: CreateUnitConversionFormData) => {
    await createMutation.mutateAsync(formData);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (formData: UpdateUnitConversionFormData) => {
    if (!editingUC) return;
    await updateMutation.mutateAsync({ id: editingUC.id, data: formData });
    setEditingUC(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingUC) return;
    await deleteMutation.mutateAsync(deletingUC.id);
    setDeletingUC(null);
  };

  const columns = [
    { key: 'item_id', header: t('pages.unitConversions.itemId') },
    { key: 'from_unit_code', header: t('pages.unitConversions.fromUnit') },
    { key: 'to_unit_code', header: t('pages.unitConversions.toUnit') },
    { key: 'factor', header: t('pages.unitConversions.factor') },
    {
      key: 'actions', header: t('common.actions'), className: 'text-end',
      render: (item: UnitConversion) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingUC(item); updateForm.reset({ from_unit_code: item.from_unit_code, to_unit_code: item.to_unit_code, factor: item.factor }); }}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingUC(item); }}>
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const renderForm = (form: any, onSubmit: any, isLoading: boolean) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label={t('pages.unitConversions.item')}
        {...form.register('item_id')}
        error={form.formState.errors.item_id?.message}
        placeholder={t('pages.unitConversions.selectItem')}
        options={items.map((i: any) => ({ value: i.id, label: `${i.item_code} - ${getLocalizedName(i)}` }))}
      />
      <div className="grid grid-cols-3 gap-4">
        <Select
          label={t('pages.unitConversions.fromUnit')}
          {...form.register('from_unit_code')}
          error={form.formState.errors.from_unit_code?.message}
          placeholder={t('pages.unitConversions.from')}
          options={units.map((u: any) => ({ value: u.code, label: `${u.code} (${u.name_en})` }))}
        />
        <Select
          label={t('pages.unitConversions.toUnit')}
          {...form.register('to_unit_code')}
          error={form.formState.errors.to_unit_code?.message}
          placeholder={t('pages.unitConversions.to')}
          options={units.map((u: any) => ({ value: u.code, label: `${u.code} (${u.name_en})` }))}
        />
        <Input label={t('pages.unitConversions.factor')} type="number" step="0.0001" {...form.register('factor')} error={form.formState.errors.factor?.message} />
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingUC(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={isLoading}>{t('common.save')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.unitConversions.title')} subtitle={t('pages.unitConversions.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.unitConversions.addConversion')}</Button>} />
      <DataTable columns={columns} data={(data?.data || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('pages.unitConversions.noConversions')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.unitConversions.create')}>
        {renderForm(createForm, handleCreate, createMutation.isPending)}
      </Modal>

      <Modal isOpen={!!editingUC} onClose={() => { setEditingUC(null); updateForm.reset(); }} title={t('pages.unitConversions.edit')}>
        {renderForm(updateForm, handleUpdate, updateMutation.isPending)}
      </Modal>

      <ConfirmDialog isOpen={!!deletingUC} onClose={() => setDeletingUC(null)} onConfirm={handleDelete} title={t('pages.unitConversions.delete')} message={t('pages.unitConversions.deleteMessage')} isLoading={deleteMutation.isPending} />
    </div>
  );
}
