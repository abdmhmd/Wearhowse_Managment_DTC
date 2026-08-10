import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useReturnCustody } from '@/hooks/useCustodies';
import { Modal, Button, Select, Input } from '@/components/ui';
import type { Custody, CustodyCondition } from '@/types';

interface Props {
  custody: Custody | null;
  onClose: () => void;
}

export default function ReturnCustodyModal({ custody, onClose }: Props) {
  const { t } = useTranslation();
  const returnMutation = useReturnCustody();
  const [condition, setCondition] = useState<CustodyCondition>('good');
  const [returnedQuantity, setReturnedQuantity] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (custody) {
      setCondition('good');
      setReturnedQuantity('');
      setNotes('');
    }
  }, [custody]);

  const handleSubmit = async () => {
    if (!custody) return;
    const payload: { condition: CustodyCondition; returned_quantity?: number; notes?: string } = { condition };
    if (condition === 'good') {
      const qty = Number(returnedQuantity);
      if (returnedQuantity !== '' && (!isFinite(qty) || qty <= 0 || qty > Number(custody.quantity))) {
        return;
      }
      if (returnedQuantity !== '') payload.returned_quantity = qty;
    }
    if (notes.trim()) payload.notes = notes.trim();
    await returnMutation.mutateAsync({ id: custody.id, payload });
    onClose();
  };

  return (
    <Modal isOpen={!!custody} onClose={onClose} title={t('pages.custodies.return')}>
      <p className="text-sm text-gray-500 mb-4">{t('pages.custodies.returnConfirm')}</p>

      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.custodies.returnCondition')}</label>
      <Select
        value={condition}
        onChange={(e) => setCondition(e.target.value as CustodyCondition)}
        className="mb-4"
        options={[
          { value: 'good', label: t('pages.custodies.good') },
          { value: 'damaged', label: t('pages.custodies.damaged') },
          { value: 'lost', label: t('pages.custodies.lost') },
        ]}
      />

      {condition !== 'good' && (
        <p className="text-sm text-amber-600 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {t('pages.custodies.nonRestorableHint')}
        </p>
      )}

      {condition === 'good' && (
        <>
          <Input
            type="number"
            min="0"
            label={`${t('pages.custodies.returnedQty')} (${t('pages.custodies.quantity')}: ${custody?.quantity} ${custody?.unit_code})`}
            value={returnedQuantity}
            onChange={(e) => setReturnedQuantity(e.target.value)}
            placeholder={String(custody?.quantity ?? '')}
            className="mb-2"
          />
          <p className="text-sm text-gray-400 mb-4">{t('pages.custodies.partialReturnHint')}</p>
        </>
      )}

      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.custodies.returnNotes')}</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 mb-4"
      />

      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="button" onClick={handleSubmit} isLoading={returnMutation.isPending}>
          {t('pages.custodies.return')}
        </Button>
      </div>
    </Modal>
  );
}
