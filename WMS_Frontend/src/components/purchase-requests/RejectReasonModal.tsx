import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '@/components/ui';

interface RejectReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
  confirmLabel?: string;
}

export default function RejectReasonModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  confirmLabel,
}: RejectReasonModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('pages.purchaseRequests.rejectReason')}>
      <div className="space-y-4">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('pages.purchaseRequests.rejectReasonPlaceholder')}
          rows={3}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => onSubmit(reason.trim())} disabled={!reason.trim() || isLoading}>
            {confirmLabel || t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}