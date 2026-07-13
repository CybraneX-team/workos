import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function VCAccessGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  // Only the specific bypass user can access VC pages.
  const isBypassUser = !!user && user.email === 'developer.cybranex@gmail.com';

  if (!isBypassUser) {
    // Redirect normal users away from VC pages (e.g., to their overview)
    return <Navigate to="/overview" replace />;
  }

  return <>{children}</>;
}
