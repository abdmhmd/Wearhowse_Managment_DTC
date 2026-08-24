import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  usePurchaseOrder,
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useClosePurchaseOrder,
  useReceivePurchaseOrder,
  useAllocateStock,
  useTransferAllocation,
} from '@/hooks/usePurchaseOrders';
import { useAllWarehouses } from '@/hooks/useWarehouses';
import { PageHeader, Button, Badge, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import { useAuthStore } from '@/store/auth.store';
import type { AllocationStatus, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '@/types';

const statusVariant = (status: string) => {
  switch (status) {
    case 'draft': return 'default' as const;
    case 'approved': return 'info' as const;
    case 'partially_received': return 'warning' as const;
    case 'partially_transferred': return 'warning' as const;
    case 'received':
    case 'transferred':
    case 'closed': return 'success' as const;
    case 'cancelled': return 'danger' as const;
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
  const allocateMutation = useAllocateStock();
  const transferMutation = useTransferAllocation();

  const [confirmAction, setConfirmAction] = useState<'approve' | 'cancel' | 'close' | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [allocateFor, setAllocateFor] = useState<PurchaseOrderLine | null>(null);
  const [transferFor, setTransferFor] = useState<{ allocationId: number; remaining: number } | null>(null);

  // Receive dialog state: per-line quantities
  const [receiveQtys, setReceiveQtys] = useState<Record<number, string>>({});
  // Allocate dialog state
  const [allocQty, setAllocQty] = useState('');
  const [allocDest, setAllocDest] = useState('');
  // Transfer dialog state
  const [transferQty, setTransferQty] = useState('');

  const isManager = user?.role === 'warehouse_manager';

  // Destination picker: active non-main warehouses. Managers see only their
  // own assignments; admins see every departmental warehouse.
  const { data: warehousesData } = useAllWarehouses(can('warehouses:view') || isManager);
  const destWarehouses = (warehousesData?.items || [])
    .filter((w: any) => !w.is_main && w.is_active !== false)
    .filter((w: any) => (isManager ? (user?.warehouse_ids ?? []).includes(w.id) : true));

  if (isLoading || !po) {
    return <div className="p-6 text-gray-500">{t('common.loading')}</div>;
  }

  const order = po as PurchaseOrder;
  const status: PurchaseOrderStatus = order.status;
  const details: PurchaseOrderLine[] = order.details || [];
  const allocations = order.allocations || [];

  const canEditNow = can('purchase-orders:update') && status === 'draft';
  const canApproveNow = can('purchase-orders:approve') && status === 'draft';
  const canCancelNow =
    can('purchase-orders:cancel') && ['draft', 'approved', 'partially_received'].includes(status);
  const canReceiveNow =
    can('purchase-orders:receive') && ['approved', 'partially_received'].includes(status);
  const canAllocateNow =
    can('purchase-orders:allocate') && ['approved', 'partially_received', 'received'].includes(status);

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

  const openAllocate = (line: PurchaseOrderLine) => {
    setAllocateFor(line);
    setAllocQty('');
    setAllocDest(destWarehouses.length === 1 ? String(destWarehouses[0].id) : '');
  };

  const handleAllocate = async () => {
    if (!poId || !allocateFor || !allocDest) return;
    await allocateMutation.mutateAsync({
      id: poId,
      detail_id: allocateFor.id,
      dest_warehouse_id: Number(allocDest),
      quantity: Number(allocQty),
    });
    setAllocateFor(null);
  };

  const openTransfer = (allocationId: number, remaining: number) => {
    setTransferFor({ allocationId, remaining });
    setTransferQty(String(remaining));
  };

  const handleTransfer = async () => {
    if (!transferFor) return;
    await transferMutation.mutateAsync({
      allocationId: transferFor.allocationId,
      quantity: Number(transferQty),
    });
    setTransferFor(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={order.po_number}
        subtitle={`${getLocalizedName({ name_ar: order.supplier_name_ar ?? undefined, name_en: order.supplier_name_en ?? undefined }) || '-'} → ${getLocalizedName({ name_ar: order.warehouse_name_ar, name_en: order.warehouse_name_en })}`}
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

      {/* Lines */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.items.title')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityOrdered')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityReceived')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.remainingToReceive')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityAllocated')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityTransferred')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.unitPrice')}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {details.map((d) => {
              const remaining = num(d.quantity_ordered) - num(d.quantity_received);
              const allocatable = num(d.quantity_received) - num(d.quantity_allocated);
              return (
                <tr key={d.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{d.item_code}</span> — {getLocalizedName({ name_ar: d.item_name_ar, name_en: d.item_name_en })}
                  </td>
                  <td className="px-4 py-2 text-end">{num(d.quantity_ordered)}</td>
                  <td className="px-4 py-2 text-end">{num(d.quantity_received)}</td>
                  <td className="px-4 py-2 text-end">{remaining}</td>
                  <td className="px-4 py-2 text-end">{num(d.quantity_allocated)}</td>
                  <td className="px-4 py-2 text-end">{num(d.quantity_transferred)}</td>
                  <td className="px-4 py-2 text-end">{num(d.unit_price)}</td>
                  <td className="px-4 py-2 text-end">
                    {canAllocateNow && allocatable > 0 && (
                      <Button variant="secondary" onClick={() => openAllocate(d)}>
                        {t('pages.purchaseOrders.actions.allocate')}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Allocations */}
      <h3 className="font-medium text-gray-900">{t('pages.purchaseOrders.allocations')}</h3>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.items.title')}</th>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('pages.purchaseOrders.destination')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityAllocated')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.quantityTransferred')}</th>
              <th className="px-4 py-2 text-end font-medium text-gray-500">{t('pages.purchaseOrders.remainingToTransfer')}</th>
              <th className="px-4 py-2 text-start font-medium text-gray-500">{t('common.status')}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allocations.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">{t('pages.purchaseOrders.noAllocations')}</td></tr>
            )}
            {allocations.map((a) => {
              const allocated = num(a.quantity_allocated);
              const transferred = num(a.quantity_transferred);
              const remaining = allocated - transferred;
              const open = ['allocated', 'partially_transferred'].includes(a.status as AllocationStatus);
              const canTransfer =
                can('purchase-orders:transfer') && open && remaining > 0 &&
                (!isManager || (user?.warehouse_ids ?? []).includes(Number((a as any).source_warehouse_id)));
              return (
                <tr key={a.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{a.item_code}</span> — {getLocalizedName({ name_ar: a.item_name_ar, name_en: a.item_name_en })}
                  </td>
                  <td className="px-4 py-2">{getLocalizedName({ name_ar: a.dest_warehouse_name_ar, name_en: a.dest_warehouse_name_en })}</td>
                  <td className="px-4 py-2 text-end">{allocated}</td>
                  <td className="px-4 py-2 text-end">{transferred}</td>
                  <td className="px-4 py-2 text-end">{remaining}</td>
                  <td className="px-4 py-2">
                    <Badge variant={statusVariant(a.status)}>{t(`pages.purchaseOrders.allocStatuses.${a.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-2 text-end">
                    {canTransfer && (
                      <Button variant="secondary" onClick={() => openTransfer(a.id, remaining)}>
                        {t('pages.purchaseOrders.actions.transfer')}
                      </Button>
                    )}
                  </td>
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

      {/* Allocate dialog */}
      <Modal isOpen={allocateFor !== null} onClose={() => setAllocateFor(null)} title={t('pages.purchaseOrders.allocateTitle')}>
        {allocateFor && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {allocateFor.item_code} — {getLocalizedName({ name_ar: allocateFor.item_name_ar, name_en: allocateFor.item_name_en })}
            </p>
            <p className="text-sm text-gray-500">
              {t('pages.purchaseOrders.allocatableHint', {
                value: num(allocateFor.quantity_received) - num(allocateFor.quantity_allocated),
              })}
            </p>
            <Select label={t('pages.purchaseOrders.destination')} value={allocDest}
              onChange={(e) => setAllocDest(e.target.value)}
              options={[
                { value: '', label: t('common.select') },
                ...destWarehouses.map((w: any) => ({ value: String(w.id), label: getLocalizedName(w) || w.code })),
              ]} />
            <Input type="number" min="0" step="any" label={t('pages.purchaseOrders.allocateQuantity')}
              value={allocQty} onChange={(e) => setAllocQty(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setAllocateFor(null)}>{t('common.cancel')}</Button>
              <Button onClick={handleAllocate} disabled={allocateMutation.isPending}>
                {t('pages.purchaseOrders.actions.allocate')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Transfer dialog */}
      <Modal isOpen={transferFor !== null} onClose={() => setTransferFor(null)} title={t('pages.purchaseOrders.transferTitle')}>
        {transferFor && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {t('pages.purchaseOrders.transferableHint', { value: transferFor.remaining })}
            </p>
            <Input type="number" min="0" max={transferFor.remaining} step="any"
              label={t('pages.purchaseOrders.transferQuantity')}
              value={transferQty} onChange={(e) => setTransferQty(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setTransferFor(null)}>{t('common.cancel')}</Button>
              <Button onClick={handleTransfer} disabled={transferMutation.isPending}>
                {t('pages.purchaseOrders.actions.transfer')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
