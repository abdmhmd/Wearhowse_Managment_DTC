import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { usePurchaseRequest } from '@/hooks/usePurchaseRequest';
import { useCancelPurchaseRequest } from '@/hooks/useCancelPurchaseRequest';
import { useApproveDept } from '@/hooks/useApproveDept';
import { useRejectDept } from '@/hooks/useRejectDept';
import { useApproveAdmin } from '@/hooks/useApproveAdmin';
import { useRejectAdmin } from '@/hooks/useRejectAdmin';
import { PageHeader, Button, Badge, ConfirmDialog } from '@/components/ui';
import RejectReasonModal from '@/components/purchase-requests/RejectReasonModal';
import { formatDate, formatDateTime } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { useAuthStore } from '@/store/auth.store';
import { getPurchaseRequestActions } from '@/utils/purchaseRequestActions';
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

type DetailAction = 'cancel' | 'approveDept' | 'approveAdmin';

export default function PurchaseRequestDetailPage() {
  const { id } = useParams();
  const prId = id ? Number(id) : undefined;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: request, isLoading } = usePurchaseRequest(prId);

  const cancelMutation = useCancelPurchaseRequest();
  const approveDeptMutation = useApproveDept();
  const rejectDeptMutation = useRejectDept();
  const approveAdminMutation = useApproveAdmin();
  const rejectAdminMutation = useRejectAdmin();

  const [confirmAction, setConfirmAction] = useState<DetailAction | null>(null);
  const [rejectStage, setRejectStage] = useState<'dept' | 'admin' | null>(null);

  if (isLoading || !request) {
    return <div className="p-6 text-gray-500">{t('common.loading')}</div>;
  }

  const pr = request as PurchaseRequest;
  const status: PurchaseRequestStatus = pr.status;
  const actions = getPurchaseRequestActions({
    permissions: (user?.permissions ?? []) as PurchaseRequestPermission[],
    userId: user?.id ?? null,
    createdBy: pr.created_by,
    status,
  });

  const isPending =
    cancelMutation.isPending ||
    approveDeptMutation.isPending ||
    approveAdminMutation.isPending ||
    rejectDeptMutation.isPending ||
    rejectAdminMutation.isPending;

  const details = pr.items || [];

  const timeline: Array<{ icon: string; title: string; by?: string | null; date?: string | null; reason?: string | null }> = [
    { icon: '●', title: t('pages.purchaseRequests.requestedOn'), by: pr.created_by_name, date: pr.created_at },
  ];
  if (pr.dept_approved_at) {
    timeline.push({ icon: '✓', title: t('pages.purchaseRequests.approvedByDept'), by: pr.dept_approved_by_name, date: pr.dept_approved_at });
  }
  if (pr.admin_approved_at) {
    timeline.push({ icon: '✓', title: t('pages.purchaseRequests.approvedByAdmin'), by: pr.admin_approved_by_name, date: pr.admin_approved_at });
  }
  if (pr.rejected_at) {
    timeline.push({ icon: '✗', title: t('pages.purchaseRequests.rejectedBy'), by: pr.rejected_by_name, date: pr.rejected_at, reason: pr.rejection_reason });
  }
  if (pr.cancelled_at) {
    timeline.push({ icon: '✕', title: t('pages.purchaseRequests.cancelledBy'), by: pr.cancelled_by_name, date: pr.cancelled_at });
  }

  const runConfirm = async () => {
    if (!prId || !confirmAction) return;
    if (confirmAction === 'cancel') await cancelMutation.mutateAsync(prId);
    if (confirmAction === 'approveDept') await approveDeptMutation.mutateAsync(prId);
    if (confirmAction === 'approveAdmin') await approveAdminMutation.mutateAsync(prId);
    setConfirmAction(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={pr.request_no}
        subtitle={getLocalizedName({ name_ar: pr.department_name_ar, name_en: pr.department_name_en })}
        actions={
          <div className="flex gap-2 flex-wrap">
            {actions.includes('cancel') && (
              <Button variant="secondary" onClick={() => setConfirmAction('cancel')} disabled={isPending}>
                {t('pages.purchaseRequests.cancel')}
              </Button>
            )}
            {actions.includes('approveDept') && (
              <Button variant="secondary" onClick={() => setConfirmAction('approveDept')} disabled={isPending}>
                {t('pages.purchaseRequests.approveDept')}
              </Button>
            )}
            {actions.includes('rejectDept') && (
              <Button variant="danger" onClick={() => setRejectStage('dept')} disabled={isPending}>
                {t('pages.purchaseRequests.rejectDept')}
              </Button>
            )}
            {actions.includes('approveAdmin') && (
              <Button onClick={() => setConfirmAction('approveAdmin')} disabled={isPending}>
                {t('pages.purchaseRequests.approveAdmin')}
              </Button>
            )}
            {actions.includes('rejectAdmin') && (
              <Button variant="danger" onClick={() => setRejectStage('admin')} disabled={isPending}>
                {t('pages.purchaseRequests.rejectAdmin')}
              </Button>
            )}
          </div>
        }
      />

      {/* Rejection notice */}
      {status === 'rejected' && pr.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium mb-1">{t('pages.purchaseRequests.rejectionAlert')}</p>
          <p>{pr.rejection_reason}</p>
        </div>
      )}

      {/* Header info */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-500">{t('pages.purchaseRequests.status')}</p>
          <Badge variant={statusVariant(status)}>{t(`pages.purchaseRequests.statusLabels.${status}`)}</Badge>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseRequests.department')}</p>
          <p className="font-medium">
            {getLocalizedName({ name_ar: pr.department_name_ar, name_en: pr.department_name_en })}
          </p>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseRequests.warehouse')}</p>
          <p className="font-medium">
            {getLocalizedName({ name_ar: pr.warehouse_name_ar, name_en: pr.warehouse_name_en })}
          </p>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseRequests.createdBy')}</p>
          <p className="font-medium">{pr.created_by_name || '-'}</p>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseRequests.createdAt')}</p>
          <p className="font-medium">{formatDate(pr.created_at)}</p>
        </div>
        {pr.notes && (
          <div className="md:col-span-3">
            <p className="text-gray-500">{t('common.notes')}</p>
            <p>{pr.notes}</p>
          </div>
        )}
      </div>

      {/* Linked PO */}
      {pr.purchase_order_id && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-gray-500">{t('pages.purchaseRequests.linkedPO')}</p>
            <p className="font-medium text-gray-900">{pr.po_number || '#'}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/purchase-orders/${pr.purchase_order_id}`)}>
            {t('pages.purchaseRequests.viewPO')}
          </Button>
        </div>
      )}

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.purchaseRequests.item')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseRequests.quantity')}</th>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.purchaseRequests.unit')}</th>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.purchaseRequests.notes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {details.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">{t('pages.purchaseRequests.noItems')}</td></tr>
            )}
            {details.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2">
                  <span className="font-medium">{d.item_code}</span> —{' '}
                  {getLocalizedName({ name_ar: d.item_name_ar, name_en: d.item_name_en })}
                </td>
                <td className="px-4 py-2 text-end">{Number(d.quantity)}</td>
                <td className="px-4 py-2">{d.unit_code}</td>
                <td className="px-4 py-2">{d.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">{t('pages.purchaseRequests.timeline')}</h3>
        <div className="space-y-3">
          {timeline.map((step, idx) => (
            <div key={idx} className="flex gap-3 text-sm">
              <span className="mt-0.5 w-4 text-center text-primary-600">{step.icon}</span>
              <div>
                <p className="font-medium text-gray-900">{step.title}</p>
                <p className="text-gray-500">
                  {step.by ? `${step.by} — ` : ''}{step.date ? formatDateTime(step.date) : '-'}
                </p>
                {step.reason && <p className="text-red-600">{t('pages.purchaseRequests.rejectReason')}: {step.reason}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirm}
        title={
          confirmAction === 'cancel'
            ? t('pages.purchaseRequests.confirmCancel')
            : t('pages.purchaseRequests.confirmApprove')
        }
        message={pr.request_no}
        confirmLabel={t('common.confirm')}
        isLoading={isPending}
      />

      <RejectReasonModal
        isOpen={rejectStage !== null}
        onClose={() => setRejectStage(null)}
        confirmLabel={rejectStage === 'admin' ? t('pages.purchaseRequests.rejectAdmin') : t('pages.purchaseRequests.rejectDept')}
        isLoading={rejectDeptMutation.isPending || rejectAdminMutation.isPending}
        onSubmit={async (reason) => {
          if (!prId || !rejectStage) return;
          if (rejectStage === 'admin') {
            await rejectAdminMutation.mutateAsync({ id: prId, reason });
          } else {
            await rejectDeptMutation.mutateAsync({ id: prId, reason });
          }
          setRejectStage(null);
        }}
      />
    </div>
  );
}