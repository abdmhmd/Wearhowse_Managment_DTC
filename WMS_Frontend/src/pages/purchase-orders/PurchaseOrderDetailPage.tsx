import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  usePurchaseOrder,
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useClosePurchaseOrder,
  useReceivePurchaseOrder,
  useConfirmPurchaseOrderReceive,
  useConfirmPurchaseOrderTransfer,
} from '@/hooks/usePurchaseOrders';
import { PageHeader, Button, Badge, Modal, Input, ConfirmDialog } from '@/components/ui';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { useAuthStore } from '@/store/auth.store';
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '@/types';

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'default' as const;
    case 'approved': return 'info' as const;
    case 'partially_received': return 'warning' as const;
    case 'received':
    case 'closed': return 'success' as const;
    case 'cancelled': return 'danger' as const;
    default: return 'default' as const;
  }
};

const trfStatusVariant = (status: string | null | undefined) => {
  switch (status) {
    case 'approved': return 'success' as const;
    case 'draft': return 'warning' as const;
    default: return 'default' as const;
  }
};

const num = (v: number | string | undefined | null): number => Number(v ?? 0) || 0;

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const poId = id ? Number(id) : undefined;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can, user } = useAuthStore();

  const { data: po, isLoading } = usePurchaseOrder(poId);
  const approveMutation = useApprovePurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();
  const closeMutation = useClosePurchaseOrder();
  const receiveMutation = useReceivePurchaseOrder();
  const confirmReceiveMutation = useConfirmPurchaseOrderReceive();
  const confirmTransferMutation = useConfirmPurchaseOrderTransfer();

  const [confirmAction, setConfirmAction] = useState<'approve' | 'cancel' | 'close' | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  // Receive dialog state: per-line quantities
  const [receiveQtys, setReceiveQtys] = useState<Record<number, string>>({});

  if (isLoading || !po) {
    return <div className="p-6 text-gray-500">{t('common.loading')}</div>;
  }

  const order = po as PurchaseOrder;
  const status: PurchaseOrderStatus = order.status;
  const details: PurchaseOrderLine[] = order.details || [];

  const canEditNow = can('purchase-orders:update') && status === 'draft';
  const canApproveNow = can('purchase-orders:approve') && status === 'draft';
  const canCancelNow =
    can('purchase-orders:cancel') && ['draft', 'approved', 'partially_received'].includes(status);
  const canReceiveNow =
    can('purchase-orders:receive') && ['approved', 'partially_received'].includes(status);

  const openReceive = () => {
    const initial: Record<number, string> = {};
    for (const d of details) {
      const remaining = num(d.quantity_ordered) - num(d.quantity_received);
      if (remaining > 0) initial[d.id] = String(remaining);
    }
    setReceiveQtys(initial);
    setReceiveOpen(true);
  };

  const handleReceive = async () => {
    if (!poId) return;
    const lines = Object.entries(receiveQtys)
      .map(([detailIdStr, qty]) => ({ detail_id: Number(detailIdStr), quantity: Number(qty) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return;
    await receiveMutation.mutateAsync({ id: poId, lines });
    setReceiveOpen(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={order.po_number}
        subtitle={`${order.supplier_name || '-'} → ${getLocalizedName({ name_ar: order.warehouse_name_ar, name_en: order.warehouse_name_en })}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            {canEditNow && (
              <Button variant="secondary" onClick={() => navigate('/purchase-orders')}>
                {t('pages.purchaseOrders.actions.editDraft')}
              </Button>
            )}
            {canApproveNow && (
              <Button onClick={() => setConfirmAction('approve')} disabled={approveMutation.isPending}>
                {t('pages.purchaseOrders.actions.approve')}
              </Button>
            )}
            {canReceiveNow && (
              <Button onClick={openReceive} disabled={receiveMutation.isPending}>
                {t('pages.purchaseOrders.actions.receive')}
              </Button>
            )}
            {can('purchase-orders:receive') && ['received', 'partially_received'].includes(status) && order.created_by !== user?.id && (
              <Button variant="secondary" onClick={() => confirmReceiveMutation.mutate(order.id)} disabled={confirmReceiveMutation.isPending}>
                {t('pages.purchaseOrders.actions.confirmReceive')}
              </Button>
            )}
            {canCancelNow && (
              <Button variant="danger" onClick={() => setConfirmAction('cancel')} disabled={cancelMutation.isPending}>
                {t('pages.purchaseOrders.actions.cancel')}
              </Button>
            )}
            {status === 'received' && can('purchase-orders:update') && (
              <Button variant="secondary" onClick={() => setConfirmAction('close')} disabled={closeMutation.isPending}>
                {t('pages.purchaseOrders.actions.close')}
              </Button>
            )}
          </div>
        }
      />

      {/* Header info */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-500">{t('common.status')}</p>
          <Badge variant={statusVariant(status)}>{t(`pages.purchaseOrders.statuses.${status}`)}</Badge>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseOrders.orderDate')}</p>
          <p className="font-medium">{order.order_date ? formatDate(order.order_date) : '-'}</p>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseOrders.expectedDate')}</p>
          <p className="font-medium">{order.expected_date ? formatDate(order.expected_date) : '-'}</p>
        </div>
        <div>
          <p className="text-gray-500">{t('pages.purchaseOrders.createdBy')}</p>
          <p className="font-medium">{order.created_by_name || '-'}</p>
        </div>
        {order.approved_at && (
          <div>
            <p className="text-gray-500">{t('pages.purchaseOrders.approvedAt')}</p>
            <p className="font-medium">{formatDate(order.approved_at)}</p>
          </div>
        )}
        {order.notes && (
          <div className="md:col-span-3">
            <p className="text-gray-500">{t('common.notes')}</p>
            <p>{order.notes}</p>
          </div>
        )}
      </div>

      {/* Linked purchase request */}
      {order.purchase_request_id && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-gray-500">{t('pages.purchaseOrders.createdFromRequest', { requestNo: order.purchase_request_no || '#' })}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/purchase-requests/${order.purchase_request_id}`)}>
            {t('pages.purchaseOrders.viewRequest')}
          </Button>
        </div>
      )}

      {/* Linked auto-transfer (D8) */}
      {order.linked_transfer_id && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-gray-900">{t('pages.purchaseOrders.linkedTransfer.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">{t('pages.purchaseOrders.linkedTransfer.transferNo')}</p>
              <p className="font-medium">{order.linked_transfer_no || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">{t('pages.purchaseOrders.linkedTransfer.status')}</p>
              <Badge variant={trfStatusVariant(order.linked_transfer_status)}>
                {t(`pages.purchaseOrders.linkedTransfer.statuses.${order.linked_transfer_status ?? 'draft'}`)}
              </Badge>
            </div>
            <div>
              <p className="text-gray-500">{t('pages.purchaseOrders.linkedTransfer.destination')}</p>
              <p className="font-medium">
                {getLocalizedName({ name_ar: order.linked_transfer_dest_warehouse_name_ar, name_en: order.linked_transfer_dest_warehouse_name_en })}
              </p>
            </div>
          </div>
          {order.linked_transfer_status === 'draft' && can('purchase-orders:receive') && (
            <div className="flex justify-end">
              <Button onClick={() => confirmTransferMutation.mutate(order.id)} disabled={confirmTransferMutation.isPending}>
                {t('pages.purchaseOrders.actions.confirmTransfer')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Lines */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.items.title')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityOrdered')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityReceived')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.remainingToReceive')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.unitPrice')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {details.map((d) => {
              const remaining = num(d.quantity_ordered) - num(d.quantity_received);
              return (
                <tr key={d.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{d.item_code}</span> — {getLocalizedName({ name_ar: d.item_name_ar, name_en: d.item_name_en })}
                  </td>
                  <td className="px-4 py-2 text-end">{num(d.quantity_ordered)}</td>
                  <td className="px-4 py-2 text-end">{num(d.quantity_received)}</td>
                  <td className="px-4 py-2 text-end">{remaining}</td>
                  <td className="px-4 py-2 text-end">{num(d.unit_price)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Approve / Cancel / Close confirmation */}
      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!poId || !confirmAction) return;
          if (confirmAction === 'approve') await approveMutation.mutateAsync(poId);
          if (confirmAction === 'cancel') await cancelMutation.mutateAsync(poId);
          if (confirmAction === 'close') await closeMutation.mutateAsync(poId);
          setConfirmAction(null);
        }}
        title={t(`pages.purchaseOrders.confirm.${confirmAction ?? 'approve'}.title`)}
        message={t(`pages.purchaseOrders.confirm.${confirmAction ?? 'approve'}.message`)}
        confirmLabel={t('common.confirm')}
      />

      {/* Receive dialog */}
      <Modal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} title={t('pages.purchaseOrders.receiveTitle')} size="lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {t('pages.purchaseOrders.receiveIntoHint', { warehouse: getLocalizedName({ name_ar: order.warehouse_name_ar, name_en: order.warehouse_name_en }) })}
          </p>
          {details.filter((d) => num(d.quantity_ordered) - num(d.quantity_received) > 0).map((d) => {
            const ordered = num(d.quantity_ordered);
            const received = num(d.quantity_received);
            const remaining = ordered - received;
            return (
              <div key={d.id} className="grid grid-cols-12 gap-2 items-end border-b border-gray-100 pb-3">
                <div className="col-span-12 md:col-span-5 text-sm">
                  <span className="font-medium">{d.item_code}</span> — {getLocalizedName({ name_ar: d.item_name_ar, name_en: d.item_name_en })}
                  <p className="text-xs text-gray-500">
                    {t('pages.purchaseOrders.receiveProgress', { received, ordered, remaining })}
                  </p>
                </div>
                <div className="col-span-8 md:col-span-4">
                  <Input type="number" min="0" max={remaining} step="any"
                    label={t('pages.purchaseOrders.receiveQuantity')}
                    value={receiveQtys[d.id] ?? ''}
                    onChange={(e) => setReceiveQtys({ ...receiveQtys, [d.id]: e.target.value })} />
                </div>
              </div>
            );
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setReceiveOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleReceive} disabled={receiveMutation.isPending}>{t('pages.purchaseOrders.actions.receive')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}