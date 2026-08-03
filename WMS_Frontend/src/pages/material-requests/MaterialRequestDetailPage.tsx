import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useMaterialRequest, useApproveMaterialRequest, useRejectMaterialRequest, useIssueMaterialRequest, useCancelMaterialRequest } from '@/hooks/useMaterialRequests';
import { PageHeader, Button, Badge, LoadingSpinner, Modal, ConfirmDialog } from '@/components/ui';
import { ArrowLeftIcon, CheckIcon, XMarkIcon, ArrowUpTrayIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { useAuthStore } from '@/store/auth.store';

export default function MaterialRequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data, isLoading } = useMaterialRequest(Number(id));
  const approveMutation = useApproveMaterialRequest();
  const rejectMutation = useRejectMaterialRequest();
  const issueMutation = useIssueMaterialRequest();
  const cancelMutation = useCancelMaterialRequest();

  const isOps = user && ['system_admin', 'warehouse_manager', 'storekeeper'].includes(user.role);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  if (!data?.data) {
    return <div className="text-center py-12 text-gray-500">{t('common.notFound')}</div>;
  }

  const req = data.data as any;

  const handleApprove = async () => {
    await approveMutation.mutateAsync(req.id);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    await rejectMutation.mutateAsync({ id: req.id, reason: rejectReason.trim() });
    setShowReject(false);
    setRejectReason('');
  };

  const handleIssue = async () => {
    await issueMutation.mutateAsync(req.id);
    setConfirmIssue(false);
  };

  const handleCancel = async () => {
    await cancelMutation.mutateAsync(req.id);
    setConfirmCancel(false);
  };

  return (
    <div>
      <PageHeader
        title={req.request_no}
        subtitle={t(`pages.materialRequests.statuses.${req.status}`)}
        actions={
          <Button variant="secondary" onClick={() => navigate('/requests')}>
            <ArrowLeftIcon className="h-4 w-4 me-2" />
            {t('common.back')}
          </Button>
        }
      />

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">{t('pages.materialRequests.detail')}</h3>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.requestType')}</dt><dd className="text-sm font-medium">{t(`pages.materialRequests.types.${req.request_type}`)}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.department')}</dt><dd className="text-sm font-medium">{getLocalizedName({ name_ar: req.department_name_ar, name_en: req.department_name_en })}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.warehouse')}</dt><dd className="text-sm font-medium">{getLocalizedName({ name_ar: req.warehouse_name_ar, name_en: req.warehouse_name_en })}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.priority')}</dt><dd className="text-sm font-medium">{t(`pages.materialRequests.priorities.${req.priority}`)}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.project')}</dt><dd className="text-sm font-medium">{req.project_no ? `${req.project_no} - ${req.project_name || ''}` : '-'}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.requestedBy')}</dt><dd className="text-sm font-medium">{req.requested_by_name || '-'}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.requestedAt')}</dt><dd className="text-sm font-medium">{formatDate(req.created_at)}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.neededBy')}</dt><dd className="text-sm font-medium">{req.needed_by ? formatDate(req.needed_by) : '-'}</dd></div>
          <div><dt className="text-sm text-gray-500">{t('table.notes')}</dt><dd className="text-sm font-medium">{req.notes || '-'}</dd></div>
          {req.status === 'rejected' && <div><dt className="text-sm text-gray-500">{t('pages.materialRequests.rejectReason')}</dt><dd className="text-sm font-medium text-red-600">{req.rejection_reason || '-'}</dd></div>}
        </dl>

        {req.status !== 'cancelled' && req.status !== 'rejected' && (
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            {isOps && req.status === 'pending' && (
              <>
                <Button variant="outline" type="button" onClick={handleApprove} isLoading={approveMutation.isPending}>
                  <CheckIcon className="h-4 w-4 me-2" />
                  {t('pages.materialRequests.approve')}
                </Button>
                <Button variant="danger" type="button" onClick={() => setShowReject(true)}>
                  <XMarkIcon className="h-4 w-4 me-2" />
                  {t('pages.materialRequests.reject')}
                </Button>
              </>
            )}
            {isOps && req.status === 'approved' && (
              <Button type="button" onClick={() => setConfirmIssue(true)} isLoading={issueMutation.isPending}>
                <ArrowUpTrayIcon className="h-4 w-4 me-2" />
                {t('pages.materialRequests.issue')}
              </Button>
            )}
            {(isOps || req.requested_by === user?.id) && ['pending', 'approved'].includes(req.status) && (
              <Button variant="secondary" type="button" onClick={() => setConfirmCancel(true)}>
                <NoSymbolIcon className="h-4 w-4 me-2" />
                {t('pages.materialRequests.cancel')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">{t('pages.materialRequests.lineItems')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('pages.materialRequests.item')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('pages.materialRequests.quantity')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('pages.materialRequests.unit')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{t('table.notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {req.details?.length === 0 || !req.details ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">{t('pages.materialRequests.noDetails')}</td></tr>
              ) : (
                req.details.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{d.item_code} - {getLocalizedName({ name_ar: d.item_name_ar, name_en: d.item_name_en })}</td>
                    <td className="px-4 py-3 text-sm font-medium">{d.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{getLocalizedName({ name_ar: d.unit_name_ar, name_en: d.unit_name_en })} ({d.unit_code})</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{d.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showReject} onClose={() => setShowReject(false)} title={t('pages.materialRequests.reject')}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.materialRequests.rejectReason')}</label>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => setShowReject(false)}>{t('common.cancel')}</Button>
          <Button type="button" variant="danger" onClick={handleReject} disabled={!rejectReason.trim()} isLoading={rejectMutation.isPending}>{t('pages.materialRequests.reject')}</Button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={confirmIssue} onClose={() => setConfirmIssue(false)} onConfirm={handleIssue} title={t('pages.materialRequests.issue')} message={t('pages.materialRequests.issueConfirm')} confirmLabel={t('pages.materialRequests.issue')} isLoading={issueMutation.isPending} />

      <ConfirmDialog isOpen={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={handleCancel} title={t('pages.materialRequests.cancel')} message={t('pages.materialRequests.cancelConfirm')} confirmLabel={t('pages.materialRequests.cancel')} isLoading={cancelMutation.isPending} />
    </div>
  );
}
