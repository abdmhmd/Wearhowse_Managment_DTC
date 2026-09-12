import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Command } from 'cmdk';
import * as Popover from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import {
  MagnifyingGlassIcon,
  ChevronUpDownIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils';

export interface SearchableSelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  contentClassName?: string;
  clearLabel?: string;
  disabled?: boolean;
  isLoading?: boolean;
  /** Turns on server-side async search: cmdk filtering (`shouldFilter`) is
   *  disabled, the query is debounced ~300ms and sent to the caller, and the
   *  caller is expected to pass back already-filtered `options` plus
   *  `isLoading`. */
  onSearch?: (query: string) => void;
  renderOption?: (opt: SearchableSelectOption) => ReactNode;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  loadingMessage,
  contentClassName,
  clearLabel,
  disabled = false,
  isLoading = false,
  onSearch,
  renderOption,
  id,
  name,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const rtl = currentDir() === 'rtl';
  const dir = rtl ? 'rtl' : 'ltr';
  const shouldFilter = !onSearch;

  const selected = options.find((opt) => String(opt.value) === String(value));

  // Debounced server-side search (300ms) when caller drives async loading.
  useEffect(() => {
    if (!onSearch) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, onSearch]);

  const handleOpenChange = (next: boolean) => {
    if (disabled && next) return;
    setOpen(next);
    if (!next) setQuery('');
  };

  const handleSelect = (opt: SearchableSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          name={name}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-700"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-start">
            {selected && (
              <div className="min-w-0 flex-1">
                <span className="block truncate text-gray-900 dark:text-gray-100">{selected.label}</span>
                {selected.sublabel && (
                  <span className="block truncate text-xs text-gray-400 dark:text-gray-500">{selected.sublabel}</span>
                )}
              </div>
            )}
            {!selected && (
              <span className="truncate text-gray-400 dark:text-gray-500">
                {placeholder || t('components.searchableSelect.select')}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {selected && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label={clearLabel || t('components.searchableSelect.clearSelection')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    handleClear();
                  }
                }}
                className="rounded p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <XMarkIcon className="h-4 w-4" />
              </span>
            )}
            <span className="shrink-0 text-gray-400" aria-hidden>
              <ChevronUpDownIcon className="h-4 w-4" />
            </span>
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          dir={dir}
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={() => setQuery('')}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] rounded-lg border border-gray-200 bg-white text-gray-900 shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
            rtl && 'rtl-mode',
            contentClassName,
          )}
        >
          <Command shouldFilter={shouldFilter} loop dir={dir} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 dark:border-gray-700">
              <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                role="combobox"
                aria-autocomplete="list"
                placeholder={searchPlaceholder || t('components.searchableSelect.searchPlaceholder')}
                aria-label={searchPlaceholder || t('components.searchableSelect.searchPlaceholder')}
                className="h-9 w-full bg-transparent text-sm placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
            <Command.List className={cn('max-h-60 overflow-y-auto p-1', contentClassName)}>
              {isLoading ? (
                <div className="flex items-center gap-2 px-2 py-2 text-sm text-gray-500 dark:text-gray-400" role="status">
                  <LoadingDots />
                  {loadingMessage || t('components.searchableSelect.loading')}
                </div>
              ) : (
                <>
                  <Command.Empty>{emptyMessage || t('components.searchableSelect.noResults')}</Command.Empty>
                  {options.map((opt) => (
                    <Command.Item
                      key={String(opt.value)}
                      value={String(opt.value)}
                      disabled={opt.disabled}
                      onSelect={() => handleSelect(opt)}
                      className="data-[selected=true]:bg-primary-50 data-[selected=true]:text-primary-800 dark:data-[selected=true]:bg-gray-700 dark:data-[selected=true]:text-primary-300"
                    >
                      <div className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-start">
                        <div className="min-w-0 flex-1">
                          {renderOption ? (
                            renderOption(opt)
                          ) : (
                            <>
                              <span className="block truncate text-sm text-gray-900 dark:text-gray-100">{opt.label}</span>
                              {opt.sublabel && (
                                <span className="block truncate text-xs text-gray-400 dark:text-gray-500">{opt.sublabel}</span>
                              )}
                            </>
                          )}
                        </div>
                        {String(opt.value) === String(value) && (
                          <CheckIcon className="h-4 w-4 shrink-0 text-primary-600" aria-hidden />
                        )}
                      </div>
                    </Command.Item>
                  ))}
                </>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

function currentDir(): 'rtl' | 'ltr' {
  if (typeof document !== 'undefined' && document.documentElement.dir === 'rtl') return 'rtl';
  return 'ltr';
}
