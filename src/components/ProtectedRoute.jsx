import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { session, profile, loading, mfaStatus, mfaRequired } = useAuth();

  if (loading) return <div className="main">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="main">No profile found for this account. Contact an Admin.</div>;
  if (profile.must_change_password) return <Navigate to="/set-password" replace />;

  // Admin accounts must have TOTP MFA enrolled before using the app —
  // but only while an Admin has MFA switched on globally. Security is
  // unaffected either way; MFA there is a possible future addition, not
  // required today.
  if (mfaRequired && profile.role === 'admin' && mfaStatus && !mfaStatus.hasVerifiedFactor) {
    return <Navigate to="/mfa-setup" replace />;
  }

  // Any account with a verified factor must complete the AAL2 challenge
  // for this session before proceeding, but only while MFA is switched
  // on — flipping it off suspends the challenge too, not just new
  // enrollment, so turning MFA off actually lets everyone straight in.
  if (mfaRequired && mfaStatus && mfaStatus.needsChallenge) {
    return <Navigate to="/mfa-challenge" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/security/residents'} replace />;
  }

  return children;
}
