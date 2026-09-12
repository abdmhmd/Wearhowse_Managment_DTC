import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cn } from '@/utils';
import '@/i18n';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { renderWithProviders } from '@/test/test-utils';

const options: SearchableSelectOption[] = [
  { value: 1, label: 'Laptop', sublabel: 'ELEC-001' },
  { value: 2, label: 'Keyboard', sublabel: 'ELEC-002' },
  { value: 3, label: 'Mouse', sublabel: 'ELEC-003' },
  { value: 4, label: 'Monitor', sublabel: 'ELEC-004' },
  { value: 5, label: 'Printer', sublabel: 'ELEC-005' },
];

interface RenderSelectOptions {
  value?: string | number | null;
  options?: SearchableSelectOption[];
  disabled?: boolean;
  isLoading?: boolean;
  onSearch?: (q: string) => void;
}

function renderSelect(opts: RenderSelectOptions = {}) {
  const result = renderWithProviders(
    <SearchableSelect
      options={opts.options ?? options}
      value={opts.value ?? null}
      onChange={vi.fn()}
      placeholder="Select an item"
      searchPlaceholder="Search items"
      emptyMessage="No items match"
      loadingMessage="Loading items..."
      name="item-select"
    />
  );
  return result;
}

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Select an item' }));
}

describe('SearchableSelect', () => {
  it('renders a placeholder button', () => {
    renderSelect();
    expect(screen.getByRole('button', { name: 'Select an item' })).toBeInTheDocument();
  });

  it('opens the listbox when clicked', async () => {
    renderSelect();
    await openPicker();
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('filters options while typing (client-side)', async () => {
    renderSelect();
    await openPicker();
    const input = await screen.findByRole('combobox');
    await userEvent.type(input, 'mon');
    expect(screen.queryByText('Laptop')).not.toBeInTheDocument();
    expect(await screen.findByText('Monitor')).toBeInTheDocument();
  });

  it('selects an option via keyboard (arrow + enter)', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SearchableSelect
        options={options}
        value={null}
        onChange={onChange}
        placeholder="Pick an item"
        searchPlaceholder="Search items"
        name="item-select"
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pick an item' }));
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(1));
  });

  it('shows the empty message when no option matches', async () => {
    renderSelect();
    await openPicker();
    const input = await screen.findByRole('combobox');
    await userEvent.type(input, 'zzz-nothing');
    expect(await screen.findByText('No items match')).toBeInTheDocument();
  });

  it('shows a loading indicator when isLoading is set', async () => {
    renderWithProviders(
      <SearchableSelect
        options={options}
        value={null}
        onChange={vi.fn()}
        placeholder="Pick an item"
        searchPlaceholder="Search items"
        isLoading
        loadingMessage="Loading items..."
        name="item-select"
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pick an item' }));
    expect(await screen.findByText('Loading items...')).toBeInTheDocument();
  });

  it('is disabled and does not open when disabled', async () => {
    renderWithProviders(
      <SearchableSelect
        options={options}
        value={1}
        onChange={vi.fn()}
        placeholder="Select an item"
        searchPlaceholder="Search items"
        disabled
        name="item-select"
      />
    );
    const button = screen.getByRole('button', { name: 'Laptop' });
    expect(button).toBeDisabled();
    await openPicker();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports server-side async search via debounced onSearch', async () => {
    const onSearch = vi.fn();
    renderWithProviders(
      <SearchableSelect
        options={options}
        value={null}
        onChange={vi.fn()}
        placeholder="Pick an item"
        searchPlaceholder="Search items"
        onSearch={onSearch}
        name="item-select"
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pick an item' }));
    const input = await screen.findByRole('combobox');
    await user.type(input, 'key');
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith('key'));
  });

  it('applies an rtl class when the document direction is rtl', async () => {
    document.documentElement.dir = 'rtl';
    try {
      renderWithProviders(
        <SearchableSelect options={options} value={null} onChange={vi.fn()} placeholder="اختر" searchPlaceholder="بحث" name="item-select" />
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'اختر' }));
      const content = (await screen.findByRole('listbox')).closest('[role="listbox"]');
      expect(content?.closest('button')?.getAttribute('data-state')).toBe('open');
    } finally {
      document.documentElement.dir = 'ltr';
    }
  });
});
