import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePurchaseRequests } from '@/hooks/usePurchaseRequests';
import { useCancelPurchaseRequest } from '@/hooks/useCancelPurchaseRequest';
import { useApproveDept } from '@/hooks/useApproveDept';
import { useRejectDept } from '@/hooks/useRejectDept';
import { useApproveAdmin } from '@/hooks/useApproveAdmin';
import { useRejectAdmin } from '@/hooks/useRejectAdmin';
import { PageHeader, Button, DataTable, Badge, Select, ConfirmDialog } from '@/components/ui';
import RejectReasonModal from '@/components/purchase-requests/RejectReasonModal';
import { EyeIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { useAuthStore } from '@/store/auth.store';
import { getPurchaseRequestActions, type PurchaseRequestAction } from '@/utils/purchaseRequestActions';
import type { PurchaseRequest, PurchaseRequestPermission, PurchaseRequestStatus } from '@/types';

const statusVariant = (status: string) => {
  switch (status) {
    case 'pending': return 'default' as const;
    case 'dept_approved': return 'info' as const;
    case 'admin_approved': return 'success' as const;
    case 'rejected': return 'danger' as const;
    case 'cancelled': return 'default' as const;
    default: return 'default' as const;
  }
};

const STATUS_FILTERS: Array<{ value: string; status?: PurchaseRequestStatus }> = [
  { value: '' },
  { value: 'pending', status: 'pending' },
  { value: 'dept_approved', status: 'dept_approved' },
  { value: 'admin_approved', status: 'admin_approved' },
  { value: 'rejected', status: 'rejected' },
  { value: 'cancelled', status: 'cancelled' },
];

interface PendingConfirm {
  request: PurchaseRequest;
  action: PurchaseRequestAction;
}

export default function PurchaseRequestsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const filter = statusFilter ? { status: statusFilter as PurchaseRequestStatus } : undefined;
  const { data } = usePurchaseRequests(page, 20, filter);

  const cancelMutation = useCancelPurchaseRequest();
  const approveDeptMutation = useApproveDept();
  const rejectDeptMutation = useRejectDept();
  const approveAdminMutation = useApproveAdmin();
  const rejectAdminMutation = useRejectAdmin();

  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [reject, setReject] = useState<PendingConfirm | null>(null);

  const permissions = (user?.permissions ?? []) as PurchaseRequestPermission[];
  const userId = user?.id ?? null;

  const runConfirm = async () => {
    if (!confirm) return;
    const { request, action } = confirm;
    if (action === 'cancel') await cancelMutation.mutateAsync(request.id);
    if (action === 'approveDept') await approveDeptMutation.mutateAsync(request.id);
    if (action === 'approveAdmin') await approveAdminMutation.mutateAsync(request.id);
    setConfirm(null);
  };

  const items = data?.items || [];

  const columns = [
    {
      key: 'request_no',
      header: t('pages.purchaseRequests.requestNo'),
      render: (pr: PurchaseRequest) => <span className="font-medium text-gray-900">{pr.request_no}</span>,
    },
    {
      key: 'department',
      header: t('pages.purchaseRequests.department'),
      render: (pr: PurchaseRequest) => getLocalizedName({ name_ar: pr.department_name_ar ?? '', name_en: pr.department_name_en ?? '' }),
    },
    {
      key: 'warehouse',
      header: t('pages.purchaseRequests.warehouse'),
      render: (pr: PurchaseRequest) => getLocalizedName({ name_ar: pr.warehouse_name_ar ?? '', name_en: pr.warehouse_name_en ?? '' }),
    },
    {
      key: 'created_by_name',
      header: t('pages.purchaseRequests.createdBy'),
      render: (pr: PurchaseRequest) => pr.created_by_name || '-',
    },
    {
      key: 'quantity_total',
      header: t('pages.purchaseRequests.quantity'),
      render: (pr: PurchaseRequest) => Number(pr.quantity_total) || 0,
    },
    {
      key: 'status',
      header: t('pages.purchaseRequests.status'),
      render: (pr: PurchaseRequest) => (
        <Badge variant={statusVariant(pr.status)}>
          {t(`pages.purchaseRequests.statusLabels.${pr.status}`)}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('pages.purchaseRequests.createdAt'),
      render: (pr: PurchaseRequest) => formatDate(pr.created_at),
    },
    {
      key: 'actions',
      header: '',
      render: (pr: PurchaseRequest) => {
        const actions = getPurchaseRequestActions({ permissions, userId, createdBy: pr.created_by, status: pr.status });
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {actions.includes('cancel') && (
              <Button size="sm" variant="secondary" onClick={() => setConfirm({ request: pr, action: 'cancel' })}>
                {t('pages.purchaseRequests.cancel')}
              </Button>
            )}
            {actions.includes('approveDept') && (
              <Button size="sm" onClick={() => setConfirm({ request: pr, action: 'approveDept' })}>
                {t('pages.purchaseRequests.approveDept')}
              </Button>
            )}
            {actions.includes('rejectDept') && (
              <Button size="sm" variant="danger" onClick={() => setReject({ request: pr, action: 'rejectDept' })}>
                {t('pages.purchaseRequests.rejectDept')}
              </Button>
            )}
            {actions.includes('approveAdmin') && (
              <Button size="sm" onClick={() => setConfirm({ request: pr, action: 'approveAdmin' })}>
                {t('pages.purchaseRequests.approveAdmin')}
              </Button>
            )}
            {actions.includes('rejectAdmin') && (
              <Button size="sm" variant="danger" onClick={() => setReject({ request: pr, action: 'rejectAdmin' })}>
                {t('pages.purchaseRequests.rejectAdmin')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const isPending = cancelMutation.isPending || approveDeptMutation.isPending || approveAdminMutation.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('pages.purchaseRequests.title')}
        subtitle={t('pages.purchaseRequests.subtitle')}
        actions={
          <Button onClick={() => navigate('/purchase-requests/new')}>
            <PlusIcon className="h-4 w-4 me-1" />
            {t('pages.purchaseRequests.create')}
          </Button>
        }
      />

      <div className="max-w-xs">
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          options={STATUS_FILTERS.map((f) => ({
            value: f.value,
            label: f.status ? t(`pages.purchaseRequests.statusLabels.${f.status}`) : t('common.all'),
          }))}
        />
      </div>

      <DataTable
        columns={columns}
        data={items as any[]}
        emptyMessage={t('pages.purchaseRequests.empty')}
        pagination={{
          page,
          limit: 20,
          total: data?.pagination?.total ?? 0,
          totalPages: data?.pagination?.totalPages ?? 1,
          onPageChange: setPage,
        }}
        onRowClick={(pr: any) => navigate(`/purchase-requests/${pr.id}`)}
      />

      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={
          confirm?.action === 'cancel'
            ? t('pages.purchaseRequests.confirmCancel')
            : t('pages.purchaseRequests.confirmApprove')
        }
        message={confirm ? confirm.request.request_no : ''}
        confirmLabel={t('common.confirm')}
        isLoading={isPending}
      />

      <RejectReasonModal
        isOpen={reject !== null}
        onClose={() => setReject(null)}
        confirmLabel={reject?.action === 'rejectAdmin' ? t('pages.purchaseRequests.rejectAdmin') : t('pages.purchaseRequests.rejectDept')}
        isLoading={rejectDeptMutation.isPending || rejectAdminMutation.isPending}
        onSubmit={async (reason) => {
          if (!reject) return;
          if (reject.action === 'rejectAdmin') {
            await rejectAdminMutation.mutateAsync({ id: reject.request.id, reason });
          } else {
            await rejectDeptMutation.mutateAsync({ id: reject.request.id, reason });
          }
          setReject(null);
        }}
      />
    </div>
  );
}