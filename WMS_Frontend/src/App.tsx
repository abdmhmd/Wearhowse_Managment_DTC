import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Layout, ProtectedRoute } from '@/components/layout';
import { useLanguage, setDocumentDirection } from '@/i18n/helpers';
import { LoadingSpinner } from '@/components/ui';

// ── Lazy-loaded Route Components for Code Splitting ─────────────────────────
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const CategoriesPage = lazy(() => import('@/pages/categories/CategoriesPage'));
const UnitsPage = lazy(() => import('@/pages/units/UnitsPage'));
const DepartmentsPage = lazy(() => import('@/pages/departments/DepartmentsPage'));
const WarehousesPage = lazy(() => import('@/pages/warehouses/WarehousesPage'));
const ItemsPage = lazy(() => import('@/pages/items/ItemsPage'));
const ItemCardPage = lazy(() => import('@/pages/items/ItemCardPage'));
const UnitConversionsPage = lazy(() => import('@/pages/unit-conversions/UnitConversionsPage'));
const TransactionsListPage = lazy(() => import('@/pages/transactions/TransactionsListPage'));
const CreateTransactionPage = lazy(() => import('@/pages/transactions/CreateTransactionPage'));
const TransactionDetailPage = lazy(() => import('@/pages/transactions/TransactionDetailPage'));
const StockMovementsPage = lazy(() => import('@/pages/stock-movements/StockMovementsPage'));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'));
const UsersPage = lazy(() => import('@/pages/users/UsersPage'));
const SupervisorsPage = lazy(() => import('@/pages/supervisors/SupervisorsPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage'));
const CustodiesPage = lazy(() => import('@/pages/custodies/CustodiesPage'));
const MyCustodyPage = lazy(() => import('@/pages/custodies/MyCustodyPage'));
const MaterialRequestsListPage = lazy(() => import('@/pages/material-requests/MaterialRequestsListPage'));
const CreateMaterialRequestPage = lazy(() => import('@/pages/material-requests/CreateMaterialRequestPage'));
const MaterialRequestDetailPage = lazy(() => import('@/pages/material-requests/MaterialRequestDetailPage'));
const PurchaseOrdersListPage = lazy(() => import('@/pages/purchase-orders/PurchaseOrdersListPage'));
const CreatePurchaseOrderPage = lazy(() => import('@/pages/purchase-orders/CreatePurchaseOrderPage'));
const PurchaseOrderDetailPage = lazy(() => import('@/pages/purchase-orders/PurchaseOrderDetailPage'));
const PurchaseRequestsListPage = lazy(() => import('@/pages/purchase-requests/PurchaseRequestsListPage'));
const CreatePurchaseRequestPage = lazy(() => import('@/pages/purchase-requests/CreatePurchaseRequestPage'));
const PurchaseRequestDetailPage = lazy(() => import('@/pages/purchase-requests/PurchaseRequestDetailPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex h-64 w-full items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}

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

/**
 * Keeps <html lang> and <html dir> in sync with the active locale so Tailwind
 * rtl:/ltr: variants, text alignment and layout direction follow Arabic mode.
 */
function DocumentDirection() {
  const lang = useLanguage();
  useEffect(() => {
    setDocumentDirection(lang);
  }, [lang]);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DocumentDirection />
        <AppToaster />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardPage />} />

                <Route element={<ProtectedRoute allowedPermissions={['categories:view', 'units:view', 'departments:view', 'warehouses:view', 'unit-conversions:view']} />}>
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/units" element={<UnitsPage />} />
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

                <Route element={<ProtectedRoute allowedPermissions={['custodies:view_own']} />}>
                  <Route path="/my-custody" element={<MyCustodyPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['requests:view', 'requests:view_own']} />}>
                  <Route path="/requests" element={<MaterialRequestsListPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['requests:create']} />}>
                  <Route path="/requests/new" element={<CreateMaterialRequestPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['requests:view', 'requests:view_own']} />}>
                  <Route path="/requests/:id" element={<MaterialRequestDetailPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['purchase-orders:view']} />}>
                  <Route path="/purchase-orders" element={<PurchaseOrdersListPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['purchase-orders:create']} />}>
                  <Route path="/purchase-orders/new" element={<CreatePurchaseOrderPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['purchase-orders:view']} />}>
                  <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['purchase-requests:view', 'purchase-requests:view_own']} />}>
                  <Route path="/purchase-requests" element={<PurchaseRequestsListPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['purchase-requests:create']} />}>
                  <Route path="/purchase-requests/new" element={<CreatePurchaseRequestPage />} />
                </Route>

                <Route element={<ProtectedRoute allowedPermissions={['purchase-requests:view', 'purchase-requests:view_own']} />}>
                  <Route path="/purchase-requests/:id" element={<PurchaseRequestDetailPage />} />
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
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

