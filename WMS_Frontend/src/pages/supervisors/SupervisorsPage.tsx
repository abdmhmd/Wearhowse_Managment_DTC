import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSupervisorsQuery, useCreateSupervisor, useUpdateSupervisor, useDeleteSupervisor } from '@/hooks/useSupervisors';
import { useAllDepartments } from '@/hooks/useDepartments';
import { useAuthStore } from '@/store/auth.store';
import { createSupervisorSchema, updateSupervisorSchema, type CreateSupervisorFormData, type UpdateSupervisorFormData } from '@/schemas/supervisors.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge, ConfirmDialog, LoadingSpinner } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import type { Supervisor } from '@/types';

interface PendingAction {
  type: 'deactivate' | 'delete';
  item: Supervisor;
}

export default function SupervisorsPage() {
  const { t } = useTranslation();
  const { can, user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupervisor, setEditingSupervisor] = useState<Supervisor | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const { data, isLoading, isError, error } = useSupervisorsQuery(page, 20, appliedSearch);
  const { data: departmentsData } = useAllDepartments();
  const createMutation = useCreateSupervisor();
  const updateMutation = useUpdateSupervisor();
  const deleteMutation = useDeleteSupervisor();

  const createForm = useForm<CreateSupervisorFormData>({
    resolver: zodResolver(createSupervisorSchema),
    defaultValues: { is_active: true },
  });
  const updateForm = useForm<UpdateSupervisorFormData>({ resolver: zodResolver(updateSupervisorSchema) });

  const departmentOptions = (departmentsData?.items || []).map((d: any) => ({ value: d.id, label: getLocalizedName(d) }));
  const myDepartment = (departmentsData?.items || []).find((d: any) => d.id === user?.department_id);

  const isSelf = (item: Supervisor) => user?.id === item.id;
  const isAdmin = user?.role === 'system_admin';

  const handleCreate = async (formData: CreateSupervisorFormData) => {
    const payload: any = { ...formData };
    if (!isAdmin) delete payload.department_id;
    await createMutation.mutateAsync(payload);
    setIsCreateOpen(false);
    createForm.reset({ is_active: true });
  };

  const handleUpdate = async (formData: UpdateSupervisorFormData) => {
    if (!editingSupervisor) return;
    const data: any = { ...formData };
    if (!data.password) delete data.password;
    await updateMutation.mutateAsync({ id: editingSupervisor.id, data });
    setEditingSupervisor(null);
    updateForm.reset();
  };

  const handleToggleStatus = async () => {
    if (!pendingAction) return;
    const { item } = pendingAction;
    await updateMutation.mutateAsync({ id: item.id, data: { is_active: !item.is_active } });
    setPendingAction(null);
  };

  const handleDelete = async () => {
    if (!pendingAction) return;
    await deleteMutation.mutateAsync(pendingAction.item.id);
    setPendingAction(null);
  };

  const openEdit = (item: Supervisor) => {
    setEditingSupervisor(item);
    updateForm.reset({
      username: item.username,
      full_name: item.full_name,
      password: '',
      is_active: item.is_active,
    });
  };

  const columns = [
    { key: 'id', header: t('table.id') },
    { key: 'username', header: t('table.username') },
    { key: 'full_name', header: t('table.fullName') },
    {
      key: 'department', header: t('pages.supervisors.department'),
      render: (item: Supervisor) => getLocalizedName({ name_ar: item.department_name_ar ?? undefined, name_en: item.department_name_en ?? undefined }),
    },
    {
      key: 'is_active', header: t('table.status'),
      render: (item: Supervisor) => item.is_active ? <Badge variant="success">{t('common.active')}</Badge> : <Badge variant="danger">{t('common.inactive')}</Badge>,
    },
    { key: 'created_at', header: t('table.created'), render: (item: Supervisor) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: Supervisor) => (
        <div className="flex justify-end gap-2">
          {can('supervisors:update') && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
          {can('supervisors:update') && !isSelf(item) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setPendingAction({ type: 'deactivate', item }); }}
            >
              {item.is_active ? t('common.inactive') : t('common.active')}
            </Button>
          )}
          {can('supervisors:delete') && !isSelf(item) && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPendingAction({ type: 'delete', item }); }}>
              <TrashIcon className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('pages.supervisors.title')} subtitle={t('pages.supervisors.subtitle')} actions={can('supervisors:create') ? <Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.supervisors.create')}</Button> : undefined} />

      <form onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()); setPage(1); }} className="mb-4 max-w-sm">
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} />
          <Button type="submit" variant="secondary"><MagnifyingGlassIcon className="h-4 w-4" /></Button>
        </div>
      </form>

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {(error as Error)?.message || t('common.notFound')}
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />
      )}

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset({ is_active: true }); }} title={t('pages.supervisors.create')}>
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          <Input label={t('form.username')} {...createForm.register('username')} error={createForm.formState.errors.username?.message} />
          <Input label={t('form.password')} type="password" {...createForm.register('password')} error={createForm.formState.errors.password?.message} />
          <Input label={t('form.fullName')} {...createForm.register('full_name')} error={createForm.formState.errors.full_name?.message} />
          {isAdmin ? (
            <Select label={t('form.department')} {...createForm.register('department_id')} error={createForm.formState.errors.department_id?.message} options={departmentOptions} placeholder={t('pages.supervisors.selectDepartment')} />
          ) : (
            <Input label={t('pages.supervisors.department')} value={getLocalizedName(myDepartment)} disabled />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...createForm.register('is_active')} className="rounded border-gray-300" />
            {t('form.active')}
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); createForm.reset({ is_active: true }); }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={createMutation.isPending}>{t('common.create')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editingSupervisor} onClose={() => { setEditingSupervisor(null); updateForm.reset(); }} title={t('pages.supervisors.edit')}>
        <form onSubmit={updateForm.handleSubmit(handleUpdate)} className="space-y-4">
          <Input label={t('form.username')} {...updateForm.register('username')} error={updateForm.formState.errors.username?.message} />
          <Input label={t('form.newPassword')} type="password" {...updateForm.register('password')} />
          <Input label={t('form.fullName')} {...updateForm.register('full_name')} error={updateForm.formState.errors.full_name?.message} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...updateForm.register('is_active')} className="rounded border-gray-300" />
            {t('form.active')}
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => { setEditingSupervisor(null); updateForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={updateMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={pendingAction?.type === 'delete' ? handleDelete : handleToggleStatus}
        title={pendingAction?.type === 'delete' ? t('common.confirmDelete') : t('common.areYouSure')}
        message={pendingAction?.type === 'delete'
          ? t('common.confirmDeleteMessage', { name: pendingAction?.item.username || '' })
          : pendingAction?.item.is_active
            ? t('pages.supervisors.deactivateConfirm', { name: pendingAction?.item.username || '' })
            : t('pages.supervisors.activateConfirm', { name: pendingAction?.item.username || '' })}
        isLoading={pendingAction?.type === 'delete' ? deleteMutation.isPending : updateMutation.isPending}
      />
    </div>
  );
}
