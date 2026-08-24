import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustodies, useReturnCustody } from '@/hooks/useCustodies';
import { PageHeader, Badge, DataTable, Button, Modal } from '@/components/ui';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/utils';
import { getLocalizedName } from '@/i18n/helpers';
import type { Custody } from '@/types';

export default function MyCustodyPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [returning, setReturning] = useState<Custody | null>(null);
  const [returnNotes, setReturnNotes] = useState('');

  const { data } = useCustodies(page, 20, { status: 'active' });
  const returnMutation = useReturnCustody();

  const handleReturn = async () => {
    if (!returning) return;
    await returnMutation.mutateAsync({
      id: returning.id,
      payload: { notes: returnNotes.trim() || undefined },
    });
    setReturning(null);
    setReturnNotes('');
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, any> = {
      active: 'warning',
      returned: 'success',
      return_pending: 'info',
      damaged: 'danger',
      lost: 'danger',
    };
    return <Badge variant={variants[status] || 'default'}>{t(`pages.custodies.${status}`)}</Badge>;
  };

  const columns = [
    { key: 'item_code', header: t('pages.custodies.item'), render: (item: any) => `${item.item_code || ''} - ${getLocalizedName({ name_ar: item.item_name_ar, name_en: item.item_name_en })}` },
    { key: 'quantity', header: t('pages.custodies.quantity') },
    { key: 'unit_code', header: t('table.unit') },
    { key: 'status', header: t('table.status'), render: (item: any) => statusBadge(item.status) },
    { key: 'project_no', header: t('pages.custodies.project'), render: (item: any) => item.project_no || '-' },
    { key: 'created_at', header: t('pages.custodies.issuedOn'), render: (item: any) => formatDate(item.created_at) },
    { key: 'expected_return_at', header: t('pages.custodies.returnedOn'), render: (item: any) => item.expected_return_at ? formatDate(item.expected_return_at) : '-' },
    {
      key: 'actions', header: t('table.actions'), className: 'text-end',
      render: (item: any) => (
        <div className="flex justify-end gap-1">
          {item.status === 'active' && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setReturning(item); setReturnNotes(''); }}>
              <ArrowUpTrayIcon className="h-4 w-4 text-blue-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('nav.myCustody')} subtitle={t('pages.custodies.subtitle')} />

      <DataTable
        columns={columns}
        data={(data?.items || []) as any[]}
        pagination={data?.pagination ? { ...data.pagination, onPageChange: setPage } : undefined}
        emptyMessage={t('pages.custodies.noData')}
      />

      <Modal isOpen={!!returning} onClose={() => setReturning(null)} title={t('pages.custodies.requestReturn')}>
        <p className="text-sm text-gray-600 mb-4">{t('pages.custodies.requestReturnConfirm')}</p>
        {returning && (
          <div className="mb-4 text-sm text-gray-700">
            <p><span className="font-medium">{t('pages.custodies.item')}:</span> {returning.item_code} - {getLocalizedName({ name_ar: returning.item_name_ar, name_en: returning.item_name_en })}</p>
            <p><span className="font-medium">{t('pages.custodies.quantity')}:</span> {returning.quantity} {returning.unit_code}</p>
          </div>
        )}
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.custodies.returnNotes')}</label>
        <textarea
          value={returnNotes}
          onChange={(e) => setReturnNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => setReturning(null)}>{t('common.cancel')}</Button>
          <Button type="button" onClick={handleReturn} isLoading={returnMutation.isPending}>{t('pages.custodies.requestReturn')}</Button>
        </div>
      </Modal>
    </div>
  );
}
