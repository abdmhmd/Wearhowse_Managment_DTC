// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import i18n from '@/i18n';
import ItemPickerModal from '@/components/pickers/ItemPickerModal';
import { renderWithProviders } from '@/test/test-utils';

const FIXTURES = [
  { id: 1, item_code: 'ELEC-001', name_ar: 'حاسوب محمول', name_en: 'Laptop', unit_code: 'PC', current_balance: 5 },
  { id: 2, item_code: 'ELEC-002', name_ar: 'لوحة مفاتيح', name_en: 'Keyboard', unit_code: 'PC', current_balance: 12 },
  { id: 3, item_code: 'ELEC-003', name_ar: 'شاشة', name_en: 'Monitor', unit_code: 'PC', current_balance: 3 },
] as any;

const pagination = { page: 1, limit: 50, total: 3, totalPages: 1 };

vi.mock('@/hooks/useItems', () => ({
  useItems: vi.fn(() => ({
    data: { items: FIXTURES, pagination },
    isPending: false,
    error: null,
    isFetching: false,
  })),
}));

import { useItems } from '@/hooks/useItems';
const useItemsMock = vi.mocked(useItems);

function renderPicker(overrides: Record<string, unknown> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    mode: 'single',
    ...overrides,
  };
  renderWithProviders(<ItemPickerModal {...(props as any)} />);
  return props;
}

describe('ItemPickerModal', () => {
  beforeEach(() => {
    i18n.changeLanguage('en');
    document.documentElement.dir = 'ltr';
    useItemsMock.mockClear();
  });

  it('renders the title and the search input', () => {
    renderPicker();
    expect(screen.getByText('Select Items')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name or code...')).toBeInTheDocument();
  });

  it('lists items from the hook and filters out excluded ids', () => {
    renderPicker({ excludeIds: [2] });
    expect(screen.getByText(/Laptop/)).toBeInTheDocument();
    expect(screen.getByText(/Monitor/)).toBeInTheDocument();
    expect(screen.queryByText(/Keyboard/)).not.toBeInTheDocument();
  });

  it('single mode: clicking an item selects and closes', () => {
    const props = renderPicker({ mode: 'single' });
    fireEvent.click(screen.getByText(/Monitor/));
    expect(props.onSelect).toHaveBeenCalledWith([expect.objectContaining({ id: 3 })]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('multi mode: toggles items then confirm returns the selection', () => {
    const props = renderPicker({ mode: 'multi' });
    fireEvent.click(screen.getByText(/Laptop/));
    fireEvent.click(screen.getByText(/Keyboard/));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Selected' }));
    expect(props.onSelect).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 }),
    ]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('shows the empty state when there are no items', () => {
    (useItemsMock as any as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: { items: [], pagination },
      isPending: false,
      error: null,
      isFetching: false,
    });
    renderPicker();
    expect(screen.getByText('No items match your search.')).toBeInTheDocument();
  });

  it('shows loading state while pending', () => {
    (useItemsMock as any as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: null,
      isPending: true,
      error: null,
      isFetching: false,
    });
    renderPicker();
    expect(document.body.querySelector('[class*="animate-spin"]')).not.toBeNull();
  });

  it('passes server-side filter params to the hook (search/warehouse)', () => {
    renderPicker({ warehouseId: 7 });
    expect(useItemsMock).toHaveBeenCalledWith(
      1,
      50,
      expect.objectContaining({ warehouse_id: 7 })
    );
  });
});