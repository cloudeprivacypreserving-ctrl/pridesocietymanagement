import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { session, profile, loading, mfaStatus } = useAuth();

  if (loading) return <div className="main">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="main">No profile found for this account. Contact an Admin.</div>;
  if (profile.must_change_password) return <Navigate to="/set-password" replace />;

  // Admin accounts must have TOTP MFA enrolled before using the app.
  // Security is unaffected — MFA there is a possible future addition,
  // not required today.
  if (profile.role === 'admin' && mfaStatus && !mfaStatus.hasVerifiedFactor) {
    return <Navigate to="/mfa-setup" replace />;
  }

  // Any account with a verified factor must complete the AAL2 challenge
  // for this session before proceeding, even if MFA isn't mandatory for
  // their role — once enrolled, it's always enforced.
  if (mfaStatus && mfaStatus.needsChallenge) {
    return <Navigate to="/mfa-challenge" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/security/residents'} replace />;
  }

  return children;
}
