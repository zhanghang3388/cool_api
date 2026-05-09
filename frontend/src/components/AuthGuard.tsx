import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { UserRole } from '@/lib/auth';
import { landingPath } from '@/lib/auth';

/** Require any logged-in user. */
export default function AuthGuard() {
  const { data, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Require a specific role. Wrong role → bounce to the right landing page. */
export function RequireRole({ role }: { role: UserRole }) {
  const { data, isLoading } = useCurrentUser();
  if (isLoading) return <LoadingScreen />;
  if (!data) return <Navigate to="/login" replace />;
  if (data.role !== role) return <Navigate to={landingPath(data.role)} replace />;
  return <Outlet />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );
}
