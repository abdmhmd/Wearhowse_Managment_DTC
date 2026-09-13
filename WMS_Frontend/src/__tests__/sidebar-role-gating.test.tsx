import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@/i18n';
import Sidebar from '@/components/layout/Sidebar';
import { renderWithProviders, setUser } from '@/test/test-utils';
import type { Permission, UserRole } from '@/types';

const ALL_THREE: Permission[] = ['projects:view', 'custodies:view', 'requests:view'];

const NON_ADMIN_ROLES: { role: UserRole; label: string }[] = [
  { role: 'sub_warehouse_manager', label: 'Warehouse Manager' },
  { role: 'department_manager', label: 'Department Manager' },
  { role: 'supervisor', label: 'Supervisor' },
];

describe('sidebar role gating', () => {
  beforeEach(() => {
    localStorage.setItem('wms_lang', 'en');
    vi.clearAllMocks();
    setUser({});
  });

  it('hides custodies, projects and requests from admin even when the admin holds the view permissions', () => {
    setUser({ role: 'admin', permissions: ['custodies:view', 'projects:view'] });
    renderWithProviders(<Sidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Custodies' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Requests' })).toBeNull();
  });

  it.each(NON_ADMIN_ROLES)('shows custodies, projects and requests for the $label role', ({ role }) => {
    setUser({ role, permissions: ALL_THREE });
    renderWithProviders(<Sidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Custodies' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Requests' })).toBeInTheDocument();
  });

  it('still hides an item the user lacks the permission for', () => {
    setUser({ role: 'sub_warehouse_manager', permissions: ['custodies:view'] });
    renderWithProviders(<Sidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Custodies' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Requests' })).toBeNull();
  });
});