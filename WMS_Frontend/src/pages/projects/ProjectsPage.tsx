import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useProjects, useCreateProject, useUpdateProject, useCloseProject, useCancelProject, useDeleteProject } from '@/hooks/useProjects';
import { useDepartments } from '@/hooks/useDepartments';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { useSupervisors } from '@/hooks/useUsers';
import { useAuthStore } from '@/store/auth.store';
import { createProjectSchema, updateProjectSchema, type CreateProjectFormData, type UpdateProjectFormData } from '@/schemas/projects.schema';
import { PageHeader, Button, DataTable, Modal, Input, Select, Badge, ConfirmDialog } from '@/components/ui';
import { PlusIcon, PencilIcon, TrashIcon, LockClosedIcon, XCircleIcon, EyeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { Project } from '@/types';

function cleanOptional(data: Record<string, any>) {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === '' || value == null) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

const statusBadge = (status: string, t: any) => {
  if (status === 'open') return <Badge variant="success">{t('pages.projects.open')}</Badge>;
  if (status === 'closed') return <Badge variant="default">{t('pages.projects.closed')}</Badge>;
  return <Badge variant="danger">{t('pages.projects.cancelled')}</Badge>;
};

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [closingProject, setClosingProject] = useState<Project | null>(null);
  const [cancellingProject, setCancellingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const { data } = useProjects(page, 20, statusFilter ? { status: statusFilter as any } : undefined);
  const { data: departmentsData } = useDepartments(1, 200);
  const { data: warehousesData } = useAllWarehouses();
  const { can, user } = useAuthStore();
  const needsSupervisors = can('projects:create') || can('projects:update');
  const { data: supervisorsData } = useSupervisors(needsSupervisors);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const closeMutation = useCloseProject();
  const cancelMutation = useCancelProject();
  const deleteMutation = useDeleteProject();

  const departments = departmentsData?.items || [];
  const warehouses = warehousesData?.items || [];
  const supervisors = (supervisorsData || []).filter((u: any) => u.role === 'supervisor');

  const isWarehouseManager = user?.role === 'warehouse_manager';
  const isDepartmentManager = user?.role === 'department_manager';

  const createForm = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      students: [],
      department_id: isWarehouseManager && user?.department_id ? user.department_id : undefined,
    },
  });
  const updateForm = useForm<UpdateProjectFormData>({ resolver: zodResolver(updateProjectSchema) });
  const createStudents = useFieldArray({ control: createForm.control, name: 'students' });

  const warehousesForDept = (deptId: number) => {
    let list = warehouses.filter((w: any) => w.department_id === deptId);
    if (isWarehouseManager && Array.isArray(user?.warehouse_ids)) {
      list = list.filter((w: any) => user.warehouse_ids.includes(w.id));
    }
    return list;
  };

  const handleCreate = async (formData: CreateProjectFormData) => {
    const payload = cleanOptional({ ...formData });
    if (Array.isArray(payload.students)) {
      payload.students = payload.students.filter((s: any) => s?.full_name?.trim());
    }
    await createMutation.mutateAsync(payload as any);
    setIsCreateOpen(false);
    createForm.reset({ students: [] });
  };

  const handleUpdate = async (formData: UpdateProjectFormData) => {
    if (!editingProject) return;
    const data = cleanOptional({ ...formData });
    await updateMutation.mutateAsync({ id: editingProject.id, data: data as any });
    setEditingProject(null);
    updateForm.reset();
  };

  const handleClose = async () => {
    if (!closingProject) return;
    await closeMutation.mutateAsync(closingProject.id);
    setClosingProject(null);
  };

  const handleCancel = async () => {
    if (!cancellingProject) return;
    await cancelMutation.mutateAsync(cancellingProject.id);
    setCancellingProject(null);
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
    { key: 'warehouse', header: t('pages.projects.warehouse'), render: (item: any) => getLocalizedName({ name_ar: item.warehouse_name_ar, name_en: item.warehouse_name_en }) },
    { key: 'supervisor', header: t('pages.projects.supervisor'), render: (item: any) => item.supervisor_name || '-' },
    {
      key: 'status', header: t('pages.projects.status'),
      render: (item: any) => statusBadge(item.status, t),
    },
    { key: 'request_count', header: t('pages.projects.requests'), render: (item: any) => item.request_count ?? 0 },
    { key: 'students_count', header: t('pages.projects.students'), render: (item: any) => item.students_count ?? 0 },
    { key: 'created_at', header: t('table.created'), render: (item: any) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/projects/${item.id}`); }}>
            <EyeIcon className="h-4 w-4 text-blue-600" />
          </Button>
          {can('projects:close') && item.status === 'open' && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setCancellingProject(item); }}>
              <XCircleIcon className="h-4 w-4 text-red-500" />
            </Button>
          )}
          {can('projects:close') && item.status === 'open' && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setClosingProject(item); }}>
              <LockClosedIcon className="h-4 w-4 text-amber-500" />
            </Button>
          )}
          {can('projects:update') && (
            <Button variant="ghost" size="sm" onClick={(e) => {
              e.stopPropagation();
              setEditingProject(item);
              updateForm.reset({
                name: item.name,
                supervisor_id: item.supervisor_id,
                warehouse_id: item.warehouse_id,
                academic_year: item.academic_year || '',
                description: item.description || '',
                start_date: item.start_date ? String(item.start_date).slice(0, 10) : '',
                expected_completion_date: item.expected_completion_date ? String(item.expected_completion_date).slice(0, 10) : '',
                notes: item.notes || '',
              });
            }}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
          {can('projects:delete') && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeletingProject(item); }}>
              <TrashIcon className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const renderStudentsSection = () => (
    <div className="rounded-lg border border-gray-200 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{t('pages.projects.students')}</label>
        <Button variant="secondary" size="sm" type="button" onClick={() => createStudents.append({ full_name: '', student_id: '', role: '' })}>
          <PlusIcon className="h-4 w-4 me-1" />{t('pages.projects.addStudent')}
        </Button>
      </div>
      {createStudents.fields.length === 0 && (
        <p className="text-sm text-gray-400">{t('pages.projects.noStudents')}</p>
      )}
      {createStudents.fields.map((field, index) => (
        <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
          <div className="col-span-4">
            <Input placeholder={t('pages.projects.studentName')} {...createForm.register(`students.${index}.full_name` as any)} />
          </div>
          <div className="col-span-3">
            <Input placeholder={t('pages.projects.studentId')} {...createForm.register(`students.${index}.student_id` as any)} />
          </div>
          <div className="col-span-4">
            <Input placeholder={t('pages.projects.studentRole')} {...createForm.register(`students.${index}.role` as any)} />
          </div>
          <div className="col-span-1 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={() => createStudents.remove(index)}>
              <XMarkIcon className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderForm = (form: any, onSubmit: any, isLoading: boolean, isEdit = false) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Input label={t('pages.projects.name')} {...form.register('name')} error={form.formState.errors.name?.message} />
      <div className="grid grid-cols-2 gap-4">
        {!isEdit && !isWarehouseManager && (
          <Select
            label={t('pages.projects.department')}
            {...form.register('department_id')}
            error={form.formState.errors.department_id?.message}
            placeholder={t('pages.projects.selectDepartment')}
            options={departments.map((d: any) => ({ value: d.id, label: getLocalizedName(d) }))}
          />
        )}
        {!isEdit && isWarehouseManager && (
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('pages.projects.department')}</label>
            <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {(() => {
                const dept = departments.find((d: any) => d.id === user?.department_id);
                return dept ? getLocalizedName(dept) : (user?.department_id ?? '-');
              })()}
            </div>
          </div>
        )}
        <Select
          label={t('pages.projects.supervisor')}
          {...form.register('supervisor_id')}
          error={form.formState.errors.supervisor_id?.message}
          placeholder={t('pages.projects.selectSupervisor')}
          options={supervisors.map((u: any) => ({ value: u.id, label: u.full_name }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t('pages.projects.warehouse')}
          {...form.register('warehouse_id')}
          error={form.formState.errors.warehouse_id?.message}
          placeholder={t('pages.projects.selectWarehouse')}
          disabled={isEdit && isDepartmentManager}
          options={warehousesForDept(Number(form.watch('department_id')) || (editingProject?.department_id ?? 0))
            .map((w: any) => ({ value: w.id, label: getLocalizedName(w) }))}
        />
        <Input label={t('pages.projects.academicYear')} placeholder="2025/2026" {...form.register('academic_year')} />
      </div>
      <Input label={t('pages.projects.description')} {...form.register('description')} />
      <div className="grid grid-cols-2 gap-4">
        <Input type="date" label={t('pages.projects.startDate')} {...form.register('start_date')} />
        <Input type="date" label={t('pages.projects.expectedCompletion')} {...form.register('expected_completion_date')} />
      </div>
      <Input label={t('pages.projects.notes')} {...form.register('notes')} />
      {!isEdit && renderStudentsSection()}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={() => { setIsCreateOpen(false); setEditingProject(null); form.reset(); }}>{t('common.cancel')}</Button>
        <Button type="submit" isLoading={isLoading}>{isEdit ? t('common.save') : t('common.create')}</Button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={t('pages.projects.title')} subtitle={t('pages.projects.subtitle')} actions={can('projects:create') ? <Button onClick={() => setIsCreateOpen(true)}><PlusIcon className="h-4 w-4 me-2" />{t('pages.projects.create')}</Button> : undefined} />

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')}</option>
          <option value="open">{t('pages.projects.open')}</option>
          <option value="closed">{t('pages.projects.closed')}</option>
          <option value="cancelled">{t('pages.projects.cancelled')}</option>
        </select>
      </div>

      <DataTable columns={columns} data={(data?.items || []) as any[]} pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); createForm.reset({ students: [] }); }} title={t('pages.projects.create')} size="lg">
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

      <ConfirmDialog
        isOpen={!!cancellingProject}
        onClose={() => setCancellingProject(null)}
        onConfirm={handleCancel}
        title={t('pages.projects.cancelProject')}
        message={t('pages.projects.cancelConfirm')}
        confirmLabel={t('pages.projects.cancelProject')}
        isLoading={cancelMutation.isPending}
      />

      <ConfirmDialog isOpen={!!deletingProject} onClose={() => setDeletingProject(null)} onConfirm={handleDelete} title={t('common.delete')} message={t('pages.projects.deleteConfirm')} isLoading={deleteMutation.isPending} />
    </div>
  );
}
