import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useProjects, useCreateProject, useUpdateProject, useCloseProject, useDeleteProject } from '@/hooks/useProjects';
import { useDepartments } from '@/hooks/useDepartments';
import { useUsers } from '@/hooks/useUsers';
import { createProjectSchema, updateProjectSchema, type CreateProjectFormData, type UpdateProjectFormData } from '@/schemas/projects.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [closingProject, setClosingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const { data } = useProjects(page, 20, statusFilter ? { status: statusFilter as any } : undefined);
  const { data: departmentsData } = useDepartments(1, 200);
  const { data: usersData } = useUsers(1, 200);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const closeMutation = useCloseProject();
  const deleteMutation = useDeleteProject();

  const departments = departmentsData?.items || [];
  const supervisors = (usersData?.items || []).filter((u: any) => u.role === 'department_manager');

  const createForm = useForm<CreateProjectFormData>({ resolver: zodResolver(createProjectSchema) });
  const updateForm = useForm<UpdateProjectFormData>({ resolver: zodResolver(updateProjectSchema) });

  const handleCreate = async (formData: CreateProjectFormData) => {
    await createMutation.mutateAsync(formData);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const handleUpdate = async (formData: UpdateProjectFormData) => {
    if (!editingProject) return;
    const data: any = { ...formData };
    if (!data.notes) delete data.notes;
    await updateMutation.mutateAsync({ id: editingProject.id, data });
    setEditingProject(null);
    updateForm.reset();
  };

  const handleClose = async () => {
    if (!closingProject) return;
    await closeMutation.mutateAsync(closingProject.id);
    setClosingProject(null);
  };

  const handleDelete = async () => {
    if (!deletingProject) return;
    await deleteMutation.mutateAsync(deletingProject.id);
    setDeletingProject(null);
  };

  const columns = [
    { key: 'project_no', header: t('pages.projects.projectNo') },
    { key: 'name', header: t('pages.projects.name') },
    { key: 'department', header: t('pages.projects.department'), render: (item: any) => getLocalizedName({ name_ar: item.department_name_ar, name_en: item.department_name_en }) },
    { key: 'supervisor', header: t('pages.projects.supervisor'), render: (item: any) => item.supervisor_name || '-' },
    {
      key: 'status', header: t('pages.projects.status'),
      render: (item: any) => item.status === 'open' ? <Badge variant="success">{t('pages.projects.open')}</Badge> : <Badge variant="default">{t('pages.projects.closed')}</Badge>,
    },
    { key: 'request_count', header: t('pages.projects.requests'), render: (item: any) => item.request_count ?? 0 },
    { key: 'created_at', header: t('table.created'), render: (item: any) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => (
        <div className="flex justify-end gap-2">
          {item.status === 'open' && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setClosingProject(item); }}>
              <LockClosedIcon className="h-4 w-4 text-amber-500" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={(e) => {
            e.stopPropagation();
            setEditingProject(item);
            updateForm.reset({ name: item.name, supervisor_id: item.supervisor_id, notes: item.notes || '' });
          }}>
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingProject(item); }}>
            <TrashIcon className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const renderForm = (form: any, onSubmit: any, isLoading: boolean, isEdit = false) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Input label={t('pages.projects.name')} {...form.register('name')} error={form.formState.errors.name?.message} />
      <div className="grid grid-cols-2 gap-4">
        {!isEdit && (
          <Select
            label={t('pages.projects.department')}
            {...form.register('department_id')}
            error={form.formState.errors.department_id?.message}
            placeholder={t('pages.projects.selectDepartment')}
            options={departments.map((d: any) => ({ value: d.id, label: getLocalizedName(d) }))}
          />
        )}
        <Select
          label={t('pages.projects.supervisor')}
          {...form.register('supervisor_id')}
          error={form.formState.errors.supervisor_id?.message}
          placeholder={t('pages.projects.selectSupervisor')}
          options={supervisors.map((u: any) => ({ value: u.id, label: u.full_name }))}
        />
      </div>
      <Input label={t('pages.projects.notes')} {...form.register('notes')} />
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingProject(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={isLoading}>{isEdit ? t('common.save') : t('common.create')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.projects.title')} subtitle={t('pages.projects.subtitle')} actions={<Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.projects.create')}</Button>} />

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')}</option>
          <option value="open">{t('pages.projects.open')}</option>
          <option value="closed">{t('pages.projects.closed')}</option>
        </select>
      </div>

      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset(); }} title={t('pages.projects.create')} size="lg">
        {renderForm(createForm, handleCreate, createMutation.isPending)}
      </Modal>

      <Modal isOpen={!!editingProject} onClose={() => { setEditingProject(null); updateForm.reset(); }} title={t('pages.projects.edit')} size="lg">
        {renderForm(updateForm, handleUpdate, updateMutation.isPending, true)}
      </Modal>

      <ConfirmDialog
        isOpen={!!closingProject}
        onClose={() => setClosingProject(null)}
        onConfirm={handleClose}
        title={t('pages.projects.close')}
        message={
          closingProject && (closingProject.active_custodies ?? 0) > 0
            ? `${t('pages.projects.closeConfirm')} ${t('pages.projects.closeCustodyWarning', { count: closingProject.active_custodies })}`
            : t('pages.projects.closeConfirm')
        }
        confirmLabel={t('pages.projects.close')}
        isLoading={closeMutation.isPending}
      />

      <ConfirmDialog isOpen={!!deletingProject} onClose={() => setDeletingProject(null)} onConfirm={handleDelete} title={t('common.delete')} message={t('pages.projects.deleteConfirm')} isLoading={deleteMutation.isPending} />
    </div>
  );
}
