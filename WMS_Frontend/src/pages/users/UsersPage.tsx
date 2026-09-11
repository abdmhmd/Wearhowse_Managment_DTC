import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedName, getLocalizedRoleLabel } from '@/i18n/helpers';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import { useDepartments } from '@/hooks/useDepartments';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useAuthStore } from '@/store/auth.store';
import { createUserSchema, updateUserSchema, type CreateUserFormData, type UpdateUserFormData } from '@/schemas/users.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge } from '@/components/ui';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { type UserRole } from '@/types';
import type { User } from '@/types';

export default function UsersPage() {
  const { t } = useTranslation();
  const { can } = useAuthStore();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [warehouseIds, setWarehouseIds] = useState<number[]>([]);

  const { data } = useUsers(page);
  const { data: departmentsData } = useDepartments();
  const { data: warehousesData } = useAllWarehouses();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const createForm = useForm<CreateUserFormData>({ resolver: zodResolver(createUserSchema) });
  const updateForm = useForm<UpdateUserFormData>({ resolver: zodResolver(updateUserSchema) });

  const departmentOptions = (departmentsData?.items || []).map((d: any) => ({ value: d.id, label: getLocalizedName(d) }));
  const warehouseOptions = warehousesData?.items || [];

  const isWarehouseRole = (role?: string) => role === 'sub_warehouse_manager';
  const isDepartmentRole = (role?: string) => role === 'department_manager' || role === 'supervisor';

  const toggleWarehouse = (id: number) => {
    setWarehouseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async (formData: CreateUserFormData) => {
    await createMutation.mutateAsync({
      ...formData,
      department_id: formData.department_id ?? null,
      warehouse_ids: warehouseIds,
    } as any);
    setIsCreateOpen(false);
    createForm.reset();
    setWarehouseIds([]);
  };

  const handleUpdate = async (formData: UpdateUserFormData) => {
    if (!editingUser) return;
    const data: any = { ...formData, warehouse_ids: warehouseIds };
    if (!data.password) delete data.password;
    if (!data.department_id) delete data.department_id;
    await updateMutation.mutateAsync({ id: editingUser.id, data });
    setEditingUser(null);
    updateForm.reset();
    setWarehouseIds([]);
  };

  const roleOptions = (['admin', 'sub_warehouse_manager', 'department_manager', 'supervisor'] as UserRole[]).map((value) => ({ value, label: getLocalizedRoleLabel(value) }));

  const columns = [
    { key: 'id', header: t('table.id') },
    { key: 'username', header: t('table.username') },
    { key: 'full_name', header: t('table.fullName') },
    {
      key: 'department', header: t('table.department'),
      render: (item: User) => item.department_name_en || item.department_name_ar || <span className="text-gray-400">—</span>,
    },
    {
      key: 'role', header: t('table.role'),
      render: (item: User) => {
        const colors: Record<UserRole, string> = {
          admin: 'bg-red-100 text-red-800',
          sub_warehouse_manager: 'bg-blue-100 text-blue-800',
          department_manager: 'bg-amber-100 text-amber-800',
          supervisor: 'bg-purple-100 text-purple-800',
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
          {can('users:update') && (
            <Button variant="ghost" size="sm" onClick={(e) => {
              e.stopPropagation();
              setEditingUser(item);
              setWarehouseIds(item.warehouse_ids ?? []);
              updateForm.reset({ username: item.username, full_name: item.full_name, role: item.role, is_active: item.is_active, department_id: item.department_id ?? undefined });
            }}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
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
      {isDepartmentRole(form.watch('role')) && (
        <Select label={t('form.department')} {...form.register('department_id')} error={form.formState.errors.department_id?.message} options={departmentOptions} placeholder={t('form.selectDepartment')} />
      )}
      {isWarehouseRole(form.watch('role')) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.warehouses')}</label>
          <div className="border rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {warehouseOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">{t('common.noData')}</p>
            ) : (
              warehouseOptions.map((w: any) => (
                <label key={w.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={warehouseIds.includes(w.id)}
                    onChange={() => toggleWarehouse(w.id)}
                    className="rounded border-gray-300"
                  />
                  {getLocalizedName(w)}
                </label>
              ))
            )}
          </div>
        </div>
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
      <PageHeader title={t('pages.users.title')} subtitle={t('pages.users.subtitle')} actions={can('users:create') ? <Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.users.create')}</Button> : undefined} />
      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); setWarehouseIds([]); }} title={t('pages.users.create')}>
        {renderForm(createForm, handleCreate, createMutation.isPending)}
      </Modal>

      <Modal isOpen={!!editingUser} onClose={() => { setEditingUser(null); updateForm.reset(); setWarehouseIds([]); }} title={t('pages.users.edit')}>
        {renderForm(updateForm, handleUpdate, updateMutation.isPending, true)}
      </Modal>
    </div>
  );
}
