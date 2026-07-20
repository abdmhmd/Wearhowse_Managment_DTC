import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Layout, ProtectedRoute } from '@/components/layout';
import { useLanguage } from '@/i18n/helpers';
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import CategoriesPage from '@/pages/categories/CategoriesPage';
import UnitsPage from '@/pages/units/UnitsPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import DepartmentsPage from '@/pages/departments/DepartmentsPage';
import WarehousesPage from '@/pages/warehouses/WarehousesPage';
import ItemsPage from '@/pages/items/ItemsPage';
import ItemCardPage from '@/pages/items/ItemCardPage';
import UnitConversionsPage from '@/pages/unit-conversions/UnitConversionsPage';
import TransactionsListPage from '@/pages/transactions/TransactionsListPage';
import CreateTransactionPage from '@/pages/transactions/CreateTransactionPage';
import TransactionDetailPage from '@/pages/transactions/TransactionDetailPage';
import StockMovementsPage from '@/pages/stock-movements/StockMovementsPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import UsersPage from '@/pages/users/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppToaster() {
  const lang = useLanguage();
  return (
    <Toaster
      richColors
      closeButton
      position="top-center"
      duration={4000}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppToaster />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />

              <Route element={<ProtectedRoute allowedRoles={['system_admin', 'warehouse_manager']} />}>
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/units" element={<UnitsPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/departments" element={<DepartmentsPage />} />
                <Route path="/warehouses" element={<WarehousesPage />} />
                <Route path="/unit-conversions" element={<UnitConversionsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['system_admin', 'warehouse_manager', 'storekeeper']} />}>
                <Route path="/items" element={<ItemsPage />} />
                <Route path="/items/:id" element={<ItemCardPage />} />
              </Route>

              <Route path="/transactions" element={<TransactionsListPage />} />
              <Route path="/transactions/new" element={<CreateTransactionPage />} />
              <Route path="/transactions/:id" element={<TransactionDetailPage />} />

              <Route path="/stock-movements" element={<StockMovementsPage />} />

              <Route element={<ProtectedRoute allowedRoles={['system_admin', 'warehouse_manager', 'accountant']} />}>
                <Route path="/reports" element={<ReportsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['system_admin']} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
