// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import i18n from '@/i18n';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { renderWithProviders } from '@/test/test-utils';

const ITEMS: SearchableSelectOption[] = [
  { value: 1, label: 'Laptop', sublabel: 'ELEC-001' },
  { value: 2, label: 'Keyboard', sublabel: 'ELEC-002' },
  { value: 3, label: 'Mouse', sublabel: 'ELEC-003' },
  { value: 4, label: 'Monitor', sublabel: 'ELEC-004' },
  { value: 5, label: 'Printer', sublabel: 'ELEC-005' },
];

function triggerButton() {
  return screen.getByRole('button', { name: 'Pick an item' });
}

function queryCombobox() {
  return screen.queryByRole('combobox') as HTMLInputElement | null;
}

describe('SearchableSelect', () => {
  beforeEach(() => {
    i18n.changeLanguage('en');
    document.documentElement.dir = 'ltr';
  });

  it('renders the placeholder when nothing is selected', () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Select an item" name="item-picker" aria-label="Pick an item" />);
    expect(screen.getByText('Select an item')).toBeInTheDocument();
  });

  it('renders the selected option when a value is provided', () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={2} onChange={onChange} placeholder="Pick an item" name="item-picker" aria-label="Pick an item" />);
    expect(screen.getByText('Keyboard')).toBeInTheDocument();
    expect(screen.getByText('ELEC-002')).toBeInTheDocument();
  });

  it('opens the picker and lists all options on click', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Pick an item" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    const input = await screen.findByRole('combobox');
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Monitor/ })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });

  it('filters options client-side while typing', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Pick an item" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'key' } });
    expect(screen.getByRole('option', { name: /Keyboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Monitor/ })).not.toBeInTheDocument();
  });

  it('shows the empty message when nothing matches', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Pick an item" emptyMessage="No items found" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No items found')).toBeInTheDocument();
  });

  it('calls onChange with the selected value when clicking an option', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Pick an item" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    fireEvent.click(await screen.findByRole('option', { name: /Monitor/ }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('selects via keyboard: ArrowDown then Enter', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Pick an item" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    const input = await screen.findByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onChange).toHaveBeenCalled();
  });

  it('clears the selection via the clear button', () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={2} onChange={onChange} placeholder="Pick an item" clearLabel="Clear selection" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not open when disabled', () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={2} onChange={onChange} placeholder="Pick an item" disabled name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick an item' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the loading message while isLoading', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} placeholder="Pick an item" isLoading loadingMessage="Loading items..." name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(await screen.findByText('Loading items...')).toBeInTheDocument();
  });

  it('calls onSearch after typing (debounced once settled)', async () => {
    const onSearch = vi.fn();
    const onChange = vi.fn();
    renderWithProviders(<SearchableSelect options={ITEMS} value={null} onChange={onChange} onSearch={onSearch} placeholder="Pick an item" name="item-picker" aria-label="Pick an item" />);
    fireEvent.click(triggerButton());
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'lap' } });
    await new Promise((r) => setTimeout(r, 600));
    expect(onSearch).toHaveBeenCalledWith('lap');
  });

  it('renders custom option content via renderOption', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SearchableSelect
        options={ITEMS}
        value={null}
        onChange={onChange}
        placeholder="Pick an item"
        name="item-picker"
        aria-label="Pick an item"
        renderOption={(opt) => (
          <span>
            [{opt.label.toUpperCase()}] {opt.sublabel}
          </span>
        )}
      />
    );
    fireEvent.click(triggerButton());
    expect(await screen.findByText('[MONITOR] ELEC-004')).toBeInTheDocument();
  });
});
