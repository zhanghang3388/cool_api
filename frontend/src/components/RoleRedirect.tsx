import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { landingPath } from '@/lib/auth';

/** Send logged-in users to their role-appropriate landing. */
export default function RoleRedirect() {
  const { data, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!data) return <Navigate to="/login" replace />;
  return <Navigate to={landingPath(data.role)} replace />;
}
