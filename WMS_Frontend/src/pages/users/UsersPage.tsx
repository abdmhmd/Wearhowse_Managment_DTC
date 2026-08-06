import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName, getLocalizedRoleLabel } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/useUsers';
import { useDepartments } from '@/hooks/useDepartments';
import { createUserSchema, updateUserSchema, type CreateUserFormData, type UpdateUserFormData } from '@/schemas/users.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { type UserRole } from '@/types';
import type { User } from '@/types';

export default function UsersPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const { data } = useUsers(page);
  const { data: departmentsData } = useDepartments();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const createForm = useForm<CreateUserFormData>({ resolver: zodResolver(createUserSchema) });
  const updateForm = useForm<UpdateUserFormData>({ resolver: zodResolver(updateUserSchema) });

  const departmentOptions = (departmentsData?.items || []).map((d: any) => ({ value: d.id, label: getLocalizedName(d) }));

  const handleCreate = async (formData: CreateUserFormData) => {
    await createMutation.mutateAsync(formData as any);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (formData: UpdateUserFormData) => {
    if (!editingUser) return;
    const data: any = { ...formData };
    if (!data.password) delete data.password;
    if (!data.department_id) delete data.department_id;
    await updateMutation.mutateAsync({ id: editingUser.id, data });
    setEditingUser(null);
    updateForm.reset();
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    await deleteMutation.mutateAsync(deletingUser.id);
    setDeletingUser(null);
  };

  const roleOptions = (['system_admin', 'warehouse_manager', 'storekeeper', 'accountant', 'department_manager', 'viewer'] as UserRole[]).map((value) => ({ value, label: getLocalizedRoleLabel(value) }));

  const columns = [
    { key: 'id', header: t('table.id') },
    { key: 'username', header: t('table.username') },
    { key: 'full_name', header: t('table.fullName') },
    {
      key: 'role', header: t('table.role'),
      render: (item: User) => {
        const colors: Record<UserRole, string> = {
          system_admin: 'bg-red-100 text-red-800',
          warehouse_manager: 'bg-blue-100 text-blue-800',
          storekeeper: 'bg-green-100 text-green-800',
          accountant: 'bg-purple-100 text-purple-800',
          department_manager: 'bg-amber-100 text-amber-800',
          viewer: 'bg-gray-100 text-gray-700',
        };
        return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[item.role] || 'bg-gray-100 text-gray-700'}`}>{getLocalizedRoleLabel(item.role)}</span>;
      },
    },
    {
      key: 'is_active', header: t('table.status'),
      render: (item: User) => item.is_active ? <Badge variant="success">{t('common.active')}</Badge> : <Badge variant="danger">{t('common.inactive')}</Badge>,
    },
    { key: 'created_at', header: t('table.created'), render: (item: User) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: User) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => {
            e.stopPropagation();
            setEditingUser(item);
            updateForm.reset({ username: item.username, full_name: item.full_name, role: item.role, is_active: item.is_active, department_id: (item as any).department_id ?? undefined });
          }}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingUser(item); }}>
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const renderForm = (form: any, onSubmit: any, isLoading: boolean, isEdit = false) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Input label={t('form.username')} {...form.register('username')} error={form.formState.errors.username?.message} />
      {!isEdit && <Input label={t('form.password')} type="password" {...form.register('password')} error={form.formState.errors.password?.message} />}
      {isEdit && <Input label={t('form.newPassword')} type="password" {...form.register('password')} />}
      <Input label={t('form.fullName')} {...form.register('full_name')} error={form.formState.errors.full_name?.message} />
      <Select label={t('form.role')} {...form.register('role')} error={form.formState.errors.role?.message} options={roleOptions} placeholder={t('form.selectRole')} />
      {form.watch('role') === 'department_manager' && (
        <Select label={t('form.department')} {...form.register('department_id')} error={form.formState.errors.department_id?.message} options={departmentOptions} placeholder={t('form.selectDepartment')} />
      )}
      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register('is_active')} className="rounded border-gray-300" />
          {t('form.active')}
        </label>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingUser(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={isLoading}>{isEdit ? t('common.save') : t('common.create')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.users.title')} subtitle={t('pages.users.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.users.create')}</Button>} />
      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.users.create')}>
        {renderForm(createForm, handleCreate, createMutation.isPending)}
      </Modal>

      <Modal isOpen={!!editingUser} onClose={() => { setEditingUser(null); updateForm.reset(); }} title={t('pages.users.edit')}>
        {renderForm(updateForm, handleUpdate, updateMutation.isPending, true)}
      </Modal>

      <ConfirmDialog isOpen={!!deletingUser} onClose={() => setDeletingUser(null)} onConfirm={handleDelete} title={t('common.confirmDelete')} message={t('common.confirmDeleteMessage', { name: deletingUser?.username || '' })} isLoading={deleteMutation.isPending} />
    </div>
  );
}
