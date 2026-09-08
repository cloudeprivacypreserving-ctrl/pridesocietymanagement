import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <div className="main">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="main">No profile found for this account. Contact an Admin.</div>;
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/security/residents'} replace />;
  }

  return children;
}
