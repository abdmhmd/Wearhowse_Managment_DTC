import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useCancelMaterialRequest } from '@/hooks/useMaterialRequests';
import { PageHeader, Button, DataTable, Badge, Modal, ConfirmDialog } from '@/components/ui';
import { PlusIcon, EyeIcon, CheckIcon, XMarkIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { useAuthStore } from '@/store/auth.store';
import type { MaterialRequest, RequestStatus } from '@/types';

export default function MaterialRequestsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [rejecting, setRejecting] = useState<MaterialRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelling, setCancelling] = useState<MaterialRequest | null>(null);

  const { data } = useMaterialRequests(page, 20, {
    ...(statusFilter ? { status: statusFilter as RequestStatus } : {}),
    ...(typeFilter ? { request_type: typeFilter as any } : {}),
  });
  const approveMutation = useApproveMaterialRequest();
  const rejectMutation = useRejectMaterialRequest();
  const cancelMutation = useCancelMaterialRequest();

  const isOps = user && ['system_admin', 'warehouse_manager', 'storekeeper'].includes(user.role);
  const isManager = user?.role === 'department_manager';

  const handleApprove = async (item: MaterialRequest) => {
    await approveMutation.mutateAsync(item.id);
  };

  const handleReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) return;
    await rejectMutation.mutateAsync({ id: rejecting.id, reason: rejectReason.trim() });
    setRejecting(null);
    setRejectReason('');
  };

  const handleCancel = async () => {
    if (!cancelling) return;
    await cancelMutation.mutateAsync(cancelling.id);
    setCancelling(null);
  };

  const statusBadge = (status: RequestStatus) => {
    const variants: Record<RequestStatus, any> = {
      pending: 'warning',
      approved: 'info',
      rejected: 'danger',
      issued: 'success',
      cancelled: 'default',
    };
    return <Badge variant={variants[status]}>{t(`pages.materialRequests.statuses.${status}`)}</Badge>;
  };

  const columns = [
    { key: 'request_no', header: t('pages.materialRequests.requestNo') },
    { key: 'department', header: t('pages.materialRequests.department'), render: (item: any) => getLocalizedName({ name_ar: item.department_name_ar, name_en: item.department_name_en }) },
    { key: 'warehouse', header: t('pages.materialRequests.warehouse'), render: (item: any) => getLocalizedName({ name_ar: item.warehouse_name_ar, name_en: item.warehouse_name_en }) },
    { key: 'request_type', header: t('pages.materialRequests.requestType'), render: (item: any) => <Badge variant="default">{t(`pages.materialRequests.types.${item.request_type}`)}</Badge> },
    { key: 'project', header: t('pages.materialRequests.project'), render: (item: any) => item.project_no || '-' },
    { key: 'requested_by', header: t('pages.materialRequests.requestedBy'), render: (item: any) => item.requested_by_name || '-' },
    { key: 'status', header: t('table.status'), render: (item: any) => statusBadge(item.status) },
    { key: 'created_at', header: t('pages.materialRequests.requestedAt'), render: (item: any) => formatDate(item.created_at) },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/requests/${item.id}`); }}>
            <EyeIcon className="h-4 w-4" />
          </Button>
          {isOps && item.status === 'pending' && (
            <>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleApprove(item); }}>
                <CheckIcon className="h-4 w-4 text-green-600" />
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setRejecting(item); setRejectReason(''); }}>
                <XMarkIcon className="h-4 w-4 text-red-500" />
              </Button>
            </>
          )}
          {(isOps || isManager) && ['pending', 'approved'].includes(item.status) && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setCancelling(item); }}>
              <NoSymbolIcon className="h-4 w-4 text-gray-500" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('pages.materialRequests.title')} subtitle={t('pages.materialRequests.subtitle')} actions={<Button onClick={() => navigate('/requests/new')}><PlusIcon className="h-4 w-4 me-2" />{t('pages.materialRequests.create')}</Button>} />

      <div className="mb-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')}</option>
          {(['pending', 'approved', 'rejected', 'issued', 'cancelled'] as RequestStatus[]).map((s) => (
            <option key={s} value={s}>{t(`pages.materialRequests.statuses.${s}`)}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">{t('common.all')}</option>
          <option value="experiment">{t('pages.materialRequests.types.experiment')}</option>
          <option value="semester">{t('pages.materialRequests.types.semester')}</option>
          <option value="project">{t('pages.materialRequests.types.project')}</option>
        </select>
      </div>

      <DataTable columns={columns} data={((data as any)?.data?.items ?? []) as any[]} pagination={(data as any)?.data?.pagination ? { ...(data as any).data.pagination, onPageChange: setPage } : undefined} emptyMessage={t('common.noData')} />

      <Modal isOpen={!!rejecting} onClose={() => setRejecting(null)} title={t('pages.materialRequests.reject')}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.materialRequests.rejectReason')}</label>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => setRejecting(null)}>{t('common.cancel')}</Button>
          <Button type="button" variant="danger" onClick={handleReject} disabled={!rejectReason.trim()} isLoading={rejectMutation.isPending}>{t('pages.materialRequests.reject')}</Button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!cancelling} onClose={() => setCancelling(null)} onConfirm={handleCancel} title={t('pages.materialRequests.cancel')} message={t('pages.materialRequests.cancelConfirm')} confirmLabel={t('pages.materialRequests.cancel')} isLoading={cancelMutation.isPending} />
    </div>
  );
}
