import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useItems } from '@/hooks/useItems';
import type { Item } from '@/types';
import { Modal, Button, Input, LoadingSpinner } from '@/components/ui';
import { getLocalizedName } from '@/i18n/helpers';
import { cn } from '@/utils';

interface ItemPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (items: Item[]) => void;
  mode?: 'single' | 'multi';
  title?: string;
  warehouseId?: number | null;
  excludeIds?: number[];
  disabled?: boolean;
}

const PAGE_SIZE = 50;

export default function ItemPickerModal({
  isOpen,
  onClose,
  onSelect,
  mode = 'single',
  title,
  warehouseId = null,
  excludeIds = [],
  disabled = false,
}: ItemPickerModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const { data, isPending, error, isFetching } = useItems(
    page,
    PAGE_SIZE,
    { search: debouncedSearch || undefined, warehouse_id: warehouseId ?? undefined }
  );
  const items = data?.items ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;

  const excluded = new Set(excludeIds);
  const visibleItems = items.filter((it: Item) => !excluded.has(it.id));

  const toggle = (item: Item) => {
    if (disabled) return;
    if (mode === 'single') {
      onSelect([item]);
      onClose();
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = items.filter((it: Item) => selectedIds.has(it.id));
    onSelect(selected);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? t('components.itemPicker.title')} size="xl">
      <div className="space-y-4">
        <Input
          id="item-picker-search"
          placeholder={t('components.itemPicker.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {isPending ? (
          <div className="py-10 flex justify-center"><LoadingSpinner /></div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-600">{t('components.itemPicker.loadError')}</p>
        ) : visibleItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('components.itemPicker.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto" aria-label={t('components.itemPicker.resultsLabel')}>
            {visibleItems.map((it: Item) => {
              const name = getLocalizedName({ name_ar: it.name_ar, name_en: it.name_en });
              const selected = selectedIds.has(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(it)}
                  aria-pressed={mode === 'multi' ? selected : undefined}
                  className={cn(
                    'flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">{name}</span>
                    <span className="block text-xs text-gray-500">{it.item_code} — {it.unit_code}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{it.current_balance}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {mode === 'multi' && selectedIds.size > 0
              ? t('components.itemPicker.selectedCount', { count: selectedIds.size })
              : t('common.empty')}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('common.prev')}
            </Button>
            <span className="text-xs text-gray-500">{t('components.itemPicker.page', { page, total: totalPages })}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
          {mode === 'multi' && (
            <Button type="button" disabled={selectedIds.size === 0 || disabled} onClick={handleConfirm}>
              {t('components.itemPicker.confirm')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}