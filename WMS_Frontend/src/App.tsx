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
import SupervisorsPage from '@/pages/supervisors/SupervisorsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import ProjectsPage from '@/pages/projects/ProjectsPage';
import ProjectDetailPage from '@/pages/projects/ProjectDetailPage';
import CustodiesPage from '@/pages/custodies/CustodiesPage';
import MaterialRequestsListPage from '@/pages/material-requests/MaterialRequestsListPage';
import CreateMaterialRequestPage from '@/pages/material-requests/CreateMaterialRequestPage';
import MaterialRequestDetailPage from '@/pages/material-requests/MaterialRequestDetailPage';

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

              <Route element={<ProtectedRoute allowedPermissions={['categories:view', 'units:view', 'suppliers:view', 'departments:view', 'warehouses:view', 'unit-conversions:view']} />}>
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/units" element={<UnitsPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/departments" element={<DepartmentsPage />} />
                <Route path="/warehouses" element={<WarehousesPage />} />
                <Route path="/unit-conversions" element={<UnitConversionsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['items:view']} />}>
                <Route path="/items" element={<ItemsPage />} />
                <Route path="/items/:id" element={<ItemCardPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['transactions:view']} />}>
                <Route path="/transactions" element={<TransactionsListPage />} />
                <Route path="/transactions/:id" element={<TransactionDetailPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedPermissions={['transactions:create']} />}>
                <Route path="/transactions/new" element={<CreateTransactionPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['stock-movements:view-all']} />}>
                <Route path="/stock-movements" element={<StockMovementsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['projects:view', 'custodies:view']} />}>
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
                <Route path="/custodies" element={<CustodiesPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['requests:view']} />}>
                <Route path="/requests" element={<MaterialRequestsListPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['requests:create']} />}>
                <Route path="/requests/new" element={<CreateMaterialRequestPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['requests:view', 'requests:view_own']} />}>
                <Route path="/requests/:id" element={<MaterialRequestDetailPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['reports:view']} />}>
                <Route path="/reports" element={<ReportsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['users:view']} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['supervisors:view']} />}>
                <Route path="/supervisors" element={<SupervisorsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedPermissions={['settings:view']} />}>
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
