import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateMaterialRequest } from '@/hooks/useMaterialRequests';
import { useDepartments } from '@/hooks/useDepartments';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useAllItems } from '@/hooks/useItems';
import { useAllUnits } from '@/hooks/useUnits';
import { useAllProjects } from '@/hooks/useProjects';
import { createMaterialRequestSchema, type CreateMaterialRequestFormData } from '@/schemas/material-requests.schema';
import { PageHeader, Button, Input, Select, LoadingSpinner } from '@/components/ui';
import { PlusIcon, XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { getLocalizedName } from '@/i18n/helpers';
import type { RequestType } from '@/types';

export default function CreateMaterialRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { data: departmentsData } = useDepartments(1, 200);
  const { data: warehousesData } = useAllWarehouses();
  const { data: itemsData } = useAllItems();
  const { data: unitsData } = useAllUnits();
  const { data: projectsData } = useAllProjects();
  const createMutation = useCreateMaterialRequest();

  const departments = departmentsData?.items || [];
  const warehouses = warehousesData?.items || [];
  const items = itemsData?.items || [];
  const units = unitsData?.items || [];
  const projects = (projectsData?.items || []).filter((p: any) => p.status === 'open');

  const form = useForm<CreateMaterialRequestFormData>({
    resolver: zodResolver(createMaterialRequestSchema),
    defaultValues: { request_type: 'experiment', priority: 'normal', items: [{ item_id: undefined as any, quantity: 1, unit_code: '' }] },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  const requestType = form.watch('request_type') as RequestType;
  const selectedDepartmentId = form.watch('department_id');

  // Requests are fulfilled from the department's MAIN warehouse into one of the
  // department's own warehouses. Only offer the receiving (non-main) warehouses
  // of the currently selected department.
  const availableWarehouses = warehouses.filter(
    (w: any) =>
      Number(w.department_id) === Number(selectedDepartmentId) &&
      !w.is_main &&
      w.is_active !== false
  );

  const handleSubmit = async (formData: CreateMaterialRequestFormData) => {
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        department_id: formData.department_id,
        warehouse_id: formData.warehouse_id,
        request_type: formData.request_type,
        project_id: formData.project_id ? Number(formData.project_id) : null,
        priority: formData.priority,
        needed_by: formData.needed_by || undefined,
        notes: formData.notes || undefined,
        items: formData.items.map((it) => ({ item_id: Number(it.item_id), quantity: Number(it.quantity), unit_code: it.unit_code })),
      });
      navigate('/requests');
    } finally {
      setSubmitting(false);
    }
  };

  if (!departmentsData || !warehousesData) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div>
      <PageHeader title={t('pages.materialRequests.create')} subtitle={t('pages.materialRequests.subtitle')} actions={
        <Button variant="secondary" onClick={() => navigate('/requests')}>
          <ArrowLeftIcon className="h-4 w-4 me-2" />
          {t('common.back')}
        </Button>
      } />

      <div className="bg-white rounded-xl shadow p-6">
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <Select
              label={t('pages.materialRequests.department')}
              {...form.register('department_id', { onChange: () => form.setValue('warehouse_id', undefined as any) })}
              error={form.formState.errors.department_id?.message}
              placeholder={t('form.selectDepartment')}
              options={departments.map((d: any) => ({ value: d.id, label: getLocalizedName(d) }))}
            />
            <Select
              label={t('pages.materialRequests.warehouse')}
              {...form.register('warehouse_id')}
              error={form.formState.errors.warehouse_id?.message}
              placeholder={selectedDepartmentId ? t('form.selectWarehouse') : t('pages.materialRequests.selectDepartmentFirst')}
              disabled={!selectedDepartmentId}
              options={availableWarehouses.map((w: any) => ({ value: w.id, label: getLocalizedName(w) }))}
            />
            <Select
              label={t('pages.materialRequests.requestType')}
              {...form.register('request_type')}
              error={form.formState.errors.request_type?.message}
              options={(['experiment', 'semester', 'project'] as RequestType[]).map((rt) => ({ value: rt, label: t(`pages.materialRequests.types.${rt}`) }))}
            />
          </div>

          {requestType === 'project' && (
            <Select
              label={t('pages.materialRequests.project')}
              {...form.register('project_id')}
              error={form.formState.errors.project_id?.message}
              placeholder={t('pages.materialRequests.selectProject')}
              options={projects.map((p: any) => ({ value: p.id, label: `${p.project_no} - ${p.name}` }))}
            />
          )}

          <div className="grid grid-cols-3 gap-4">
            <Select
              label={t('pages.materialRequests.priority')}
              {...form.register('priority')}
              options={(['low', 'normal', 'high', 'urgent'] as const).map((p) => ({ value: p, label: t(`pages.materialRequests.priorities.${p}`) }))}
            />
            <Input label={t('pages.materialRequests.neededBy')} type="date" {...form.register('needed_by')} />
            <Input label={t('form.notes')} {...form.register('notes')} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">{t('pages.materialRequests.lineItems')}</h3>
              <Button variant="secondary" size="sm" type="button" onClick={() => append({ item_id: undefined as any, quantity: 1, unit_code: '' })}>
                <PlusIcon className="h-4 w-4 me-1" />
                {t('pages.materialRequests.addItem')}
              </Button>
            </div>

            {form.formState.errors.items?.message && (
              <p className="text-sm text-red-600 mb-2">{form.formState.errors.items.message}</p>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-6">
                    <Select
                      label={index === 0 ? t('pages.materialRequests.item') : undefined}
                      {...form.register(`items.${index}.item_id`)}
                      error={form.formState.errors.items?.[index]?.item_id?.message}
                      placeholder={t('form.selectItem')}
                      options={items.map((it: any) => ({ value: it.id, label: `${it.item_code} - ${getLocalizedName(it)}` }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={index === 0 ? t('pages.materialRequests.quantity') : undefined}
                      type="number" step="0.0001" min="0.0001"
                      {...form.register(`items.${index}.quantity`)}
                      error={form.formState.errors.items?.[index]?.quantity?.message}
                    />
                  </div>
                  <div className="col-span-3">
                    <Select
                      label={index === 0 ? t('pages.materialRequests.unit') : undefined}
                      {...form.register(`items.${index}.unit_code`)}
                      error={form.formState.errors.items?.[index]?.unit_code?.message}
                      placeholder={t('form.selectUnit')}
                      options={units.map((u: any) => ({ value: u.code, label: `${u.code} (${getLocalizedName(u)})` }))}
                    />
                  </div>
                  <div className="col-span-1 pt-6">
                    <Button variant="ghost" size="sm" type="button" onClick={() => remove(index)} disabled={fields.length <= 1}>
                      <XMarkIcon className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => navigate('/requests')}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={submitting || createMutation.isPending}>{t('common.create')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
