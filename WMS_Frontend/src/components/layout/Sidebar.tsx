import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import {
  HomeIcon,
  CubeIcon,
  RectangleStackIcon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  TruckIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  ArrowsRightLeftIcon,
  ArrowLeftOnRectangleIcon,
  XMarkIcon,
  UserIcon,
  Cog6ToothIcon,
  FolderIcon,
  ShieldCheckIcon,
  ClipboardDocumentCheckIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline';
import type { Permission } from '@/types';
import { cn } from '@/utils';

interface NavItem {
  labelKey: string;
  path: string;
  icon: React.ElementType;
  permissions?: Permission[];
}

const navItems: NavItem[] = [
  { labelKey: 'nav.dashboard', path: '/', icon: HomeIcon },
  { labelKey: 'nav.categories', path: '/categories', icon: RectangleStackIcon, permissions: ['categories:view'] },
  { labelKey: 'nav.units', path: '/units', icon: CubeIcon, permissions: ['units:view'] },
  { labelKey: 'nav.suppliers', path: '/suppliers', icon: TruckIcon, permissions: ['suppliers:view'] },
  { labelKey: 'nav.departments', path: '/departments', icon: BuildingStorefrontIcon, permissions: ['departments:view'] },
  { labelKey: 'nav.warehouses', path: '/warehouses', icon: BuildingStorefrontIcon, permissions: ['warehouses:view'] },
  { labelKey: 'nav.items', path: '/items', icon: CubeIcon, permissions: ['items:view'] },
  { labelKey: 'nav.unitConversions', path: '/unit-conversions', icon: ArrowsRightLeftIcon, permissions: ['unit-conversions:view'] },
  { labelKey: 'nav.transactions', path: '/transactions', icon: DocumentTextIcon, permissions: ['transactions:view'] },
  { labelKey: 'nav.stockMovements', path: '/stock-movements', icon: ClipboardDocumentListIcon, permissions: ['stock-movements:view-all'] },
  { labelKey: 'nav.materialRequests', path: '/requests', icon: ClipboardDocumentCheckIcon, permissions: ['requests:view', 'requests:view_own'] },
  { labelKey: 'nav.purchaseOrders', path: '/purchase-orders', icon: ShoppingCartIcon, permissions: ['purchase-orders:view'] },
  { labelKey: 'nav.projects', path: '/projects', icon: FolderIcon, permissions: ['projects:view'] },
  { labelKey: 'nav.custodies', path: '/custodies', icon: ShieldCheckIcon, permissions: ['custodies:view'] },
  { labelKey: 'nav.myCustody', path: '/my-custody', icon: ShieldCheckIcon, permissions: ['custodies:view_own'] },
  { labelKey: 'nav.reports', path: '/reports', icon: ChartBarIcon, permissions: ['reports:view'] },
  { labelKey: 'nav.settings', path: '/settings', icon: Cog6ToothIcon, permissions: ['settings:view'] },
  { labelKey: 'nav.users', path: '/users', icon: UserGroupIcon, permissions: ['users:view'] },
  { labelKey: 'nav.supervisors', path: '/supervisors', icon: UserGroupIcon, permissions: ['supervisors:view'] },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, canAny, logout } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredItems = navItems.filter(
    (item) => !item.permissions || canAny(...item.permissions)
  );

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-64 bg-white border-e border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full rtl:lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <Link to="/" className="flex items-center gap-2">
              <BuildingStorefrontIcon className="h-8 w-8 text-primary-600" />
              <span className="text-lg font-bold text-gray-900">WMS</span>
            </Link>
            <button onClick={onClose} className="lg:hidden p-1 rounded-md hover:bg-gray-100">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {filteredItems.map((item) => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
            >
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
              {t('common.logout')}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
