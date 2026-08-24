import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectDetail, useCloseProject, useCancelProject, useSetStudents } from '@/hooks/useProjects';
import ReturnCustodyModal from '@/components/custodies/ReturnCustodyModal';
import { useAuthStore } from '@/store/auth.store';
import { Button, Badge, Modal, Input, DataTable, ConfirmDialog, LoadingSpinner } from '@/components/ui';
import { ArrowLeftIcon, LockClosedIcon, XCircleIcon, PencilIcon, PlusIcon, XMarkIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { Custody, ProjectStudent } from '@/types';

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const projectId = Number(id);
  const { can } = useAuthStore();

  const { data: project, isLoading } = useProjectDetail(projectId);
  const closeMutation = useCloseProject();
  const cancelMutation = useCancelProject();
  const studentsMutation = useSetStudents();

  const [studentsOpen, setStudentsOpen] = useState(false);
  const [closingProject, setClosingProject] = useState(false);
  const [cancellingProject, setCancellingProject] = useState(false);
  const [returningCustody, setReturningCustody] = useState<Custody | null>(null);

  const studentsForm = useForm<{ students: ProjectStudent[] }>({
    values: { students: project?.students ?? [] },
  });
  const studentsFields = useFieldArray({ control: studentsForm.control, name: 'students' });

  const handleSaveStudents = async (data: { students: ProjectStudent[] }) => {
    const students = data.students.filter((s) => s?.full_name?.trim());
    await studentsMutation.mutateAsync({ id: projectId, students });
    setStudentsOpen(false);
  };

  const infoRow = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 text-end">{value || '-'}</span>
    </div>
  );

  const statusBadge = () => {
    if (!project) return null;
    if (project.status === 'open') return <Badge variant="success">{t('pages.projects.open')}</Badge>;
    if (project.status === 'closed') return <Badge variant="default">{t('pages.projects.closed')}</Badge>;
    return <Badge variant="danger">{t('pages.projects.cancelled')}</Badge>;
  };

  if (isLoading) return <LoadingSpinner />;
  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">{t('common.notFound')}</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/projects')}>{t('common.back')}</Button>
      </div>
    );
  }

  const materialsColumns = [
    { key: 'item', header: t('pages.custodies.item'), render: (item: any) => <span>{item.item_code} - {getLocalizedName({ name_ar: item.item_name_ar, name_en: item.item_name_en })}</span> },
    { key: 'assigned_to', header: t('pages.custodies.assignedTo'), render: (item: any) => item.assigned_to_name || '-' },
    { key: 'quantity', header: t('pages.custodies.quantity'), render: (item: any) => `${item.quantity} ${item.unit_code}` },
    { key: 'issueVoucher', header: t('pages.custodies.issueVoucher'), render: (item: any) => item.issued_transaction_no || `#${item.issued_transaction_id}` },
    {
      key: 'status', header: t('pages.custodies.status'),
      render: (item: any) => item.status === 'active'
        ? <Badge variant="success">{t('pages.custodies.active')}</Badge>
        : item.status === 'damaged'
          ? <Badge variant="warning">{t('pages.custodies.damaged')}</Badge>
          : item.status === 'lost'
            ? <Badge variant="danger">{t('pages.custodies.lost')}</Badge>
            : <Badge variant="default">{t('pages.custodies.returned')}</Badge>,
    },
    { key: 'return_voucher', header: t('pages.custodies.returnVoucher'), render: (item: any) => item.return_transaction_no || '-' },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => item.status === 'active' && can('custodies:return') ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setReturningCustody(item)}>
            <ArrowUturnLeftIcon className="h-4 w-4 text-green-600" />
          </Button>
        </div>
      ) : <span className="text-sm text-gray-400">{formatDate(item.returned_at)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500">{project.project_no} · {statusBadge()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {can('projects:close') && project.status === 'open' && (
            <>
              <Button variant="secondary" onClick={() => setCancellingProject(true)}>
                <XCircleIcon className="h-4 w-4 me-2" />{t('pages.projects.cancelProject')}
              </Button>
              <Button onClick={() => setClosingProject(true)}>
                <LockClosedIcon className="h-4 w-4 me-2" />{t('pages.projects.close')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('pages.projects.details')}</h2>
          {infoRow(t('pages.projects.projectNo'), project.project_no)}
          {infoRow(t('pages.projects.department'), getLocalizedName({ name_ar: project.department_name_ar, name_en: project.department_name_en }))}
          {infoRow(t('pages.projects.warehouse'), getLocalizedName({ name_ar: project.warehouse_name_ar, name_en: project.warehouse_name_en }))}
          {infoRow(t('pages.projects.supervisor'), project.supervisor_name)}
          {infoRow(t('pages.projects.academicYear'), project.academic_year)}
          {infoRow(t('pages.projects.startDate'), project.start_date ? formatDate(project.start_date) : '-')}
          {infoRow(t('pages.projects.endDate'), project.end_date ? formatDate(project.end_date) : '-')}
          {infoRow(t('pages.projects.requests'), project.request_count ?? 0)}
          {infoRow(t('pages.custodies.active'), project.active_custodies ?? 0)}
          {infoRow(t('pages.projects.notes'), project.notes)}
          {project.description && infoRow(t('pages.projects.description'), project.description)}
          {infoRow(t('table.created'), formatDate(project.created_at))}
          {infoRow(t('common.status'), statusBadge())}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              {t('pages.projects.students')}
              {typeof project.students_count === 'number' && <span className="text-gray-400 ms-2">({project.students_count})</span>}
            </h2>
            {can('projects:update') && (
              <Button variant="secondary" size="sm" onClick={() => setStudentsOpen(true)}>
                <PencilIcon className="h-4 w-4 me-1" />{t('pages.projects.editStudents')}
              </Button>
            )}
          </div>
          {project.students && project.students.length > 0 ? (
            <ul className="space-y-2">
              {project.students.map((s: any) => (
                <li key={s.id} className="text-sm border border-gray-100 rounded-lg p-3">
                  <p className="font-medium text-gray-900">{s.full_name}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {s.student_id && <span>{s.student_id}</span>}
                    {s.student_id && s.role && <span className="mx-1">·</span>}
                    {s.role && <span>{s.role}</span>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">{t('pages.projects.noStudents')}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('pages.projects.borrowedMaterials')}</h2>
        <DataTable columns={materialsColumns} data={(project.materials || []) as any[]} emptyMessage={t('pages.projects.noMaterials')} />
      </div>

      <Modal isOpen={studentsOpen} onClose={() => setStudentsOpen(false)} title={t('pages.projects.editStudents')} size="lg">
        <form onSubmit={studentsForm.handleSubmit(handleSaveStudents)} className="space-y-3">
          {studentsFields.fields.length === 0 && (
            <p className="text-sm text-gray-400">{t('pages.projects.noStudents')}</p>
          )}
          {studentsFields.fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-4">
                <Input placeholder={t('pages.projects.studentName')} {...studentsForm.register(`students.${index}.full_name` as any)} />
              </div>
              <div className="col-span-3">
                <Input placeholder={t('pages.projects.studentId')} {...studentsForm.register(`students.${index}.student_id` as any)} />
              </div>
              <div className="col-span-4">
                <Input placeholder={t('pages.projects.studentRole')} {...studentsForm.register(`students.${index}.role` as any)} />
              </div>
              <div className="col-span-1 pt-1">
                <Button variant="ghost" size="sm" type="button" onClick={() => studentsFields.remove(index)}>
                  <XMarkIcon className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" type="button" onClick={() => studentsFields.append({ full_name: '', student_id: '', role: '' })}>
            <PlusIcon className="h-4 w-4 me-1" />{t('pages.projects.addStudent')}
          </Button>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setStudentsOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" isLoading={studentsMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={closingProject}
        onClose={() => setClosingProject(false)}
        onConfirm={async () => { await closeMutation.mutateAsync(projectId); setClosingProject(false); }}
        title={t('pages.projects.close')}
        message={
          (project.active_custodies ?? 0) > 0
            ? `${t('pages.projects.closeConfirm')} ${t('pages.projects.closeCustodyWarning', { count: project.active_custodies })}`
            : t('pages.projects.closeConfirm')
        }
        confirmLabel={t('pages.projects.close')}
        isLoading={closeMutation.isPending}
      />

      <ConfirmDialog
        isOpen={cancellingProject}
        onClose={() => setCancellingProject(false)}
        onConfirm={async () => { await cancelMutation.mutateAsync(projectId); setCancellingProject(false); }}
        title={t('pages.projects.cancelProject')}
        message={t('pages.projects.cancelConfirm')}
        confirmLabel={t('pages.projects.cancelProject')}
        isLoading={cancelMutation.isPending}
      />

      <ReturnCustodyModal custody={returningCustody} onClose={() => setReturningCustody(null)} />
    </div>
  );
}
