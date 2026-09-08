import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import sohoLogo from '../assets/soho-logo.png';

const EyeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
  </svg>
);

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (!loading && session && profile) {
    if (profile.must_change_password) return <Navigate to="/set-password" replace />;
    return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/security/residents'} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="terminal-frame">
        <div className="terminal-screen">
          <div className="terminal-brand">
            <img className="brand-mark" src={sohoLogo} alt="SOHO" style={{ width: 44, height: 44, borderRadius: 12 }} />
            <div>
              <div className="terminal-brand-title">
                Society Entry <span className="topbar-tag">v1.0</span>
              </div>
              <div className="terminal-brand-sub">Facility access console</div>
            </div>
          </div>

          <div className="terminal-notice">
            &#9888; Restricted access. Only Admin and Security accounts created within the app may sign in.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="form-row">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? EyeOffIcon : EyeIcon}
                </button>
              </div>
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 4 }}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <div className="terminal-footer">Society Entry Management System</div>
      </div>
    </div>
  );
}
