import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Permission, UserRole } from '@/types';
import { LoadingSpinner } from '@/components/ui';

interface ProtectedRouteProps {
  allowedPermissions?: Permission[];
  blockedRoles?: UserRole[];
}

export default function ProtectedRoute({ allowedPermissions, blockedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading, validateToken } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      validateToken();
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (blockedRoles && user && blockedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (
    allowedPermissions &&
    user &&
    !allowedPermissions.some((p) => (user.permissions ?? []).includes(p))
  ) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
