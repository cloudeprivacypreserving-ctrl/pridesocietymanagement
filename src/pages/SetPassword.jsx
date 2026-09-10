import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import sohoLogo from '../assets/soho-logo.png';
import { Lock } from '../components/icons';

export default function SetPassword() {
  const { session, profile, completePasswordSetup } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // This page serves two flows: a first-login invite (profile exists with
  // must_change_password) and a password-recovery email link (a temporary
  // recovery session, profile may already be fully set up).
  const isRecovery = !!session && !!profile && !profile.must_change_password;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordSetup(password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to set password');
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
                <span className="input-icon" style={{ position: 'static', transform: 'none', width: 18, height: 18 }}>{Lock}</span>
                {isRecovery ? 'Reset your password' : 'Set your password'}
              </div>
              <div className="terminal-brand-sub">
                {isRecovery ? 'Password recovery' : 'One-time account setup'}
              </div>
            </div>
          </div>

          <div className="terminal-notice">
            {isRecovery
              ? 'You followed a password reset link. Choose a new password for your account.'
              : "You've been invited to Society Entry. Choose a password to finish setting up your account."}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="password">New password (min. 10 characters)</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="form-row">
              <label htmlFor="confirm">Confirm password</label>
              <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 4 }}>
              {submitting ? 'Saving...' : 'Set password'}
            </button>
          </form>
        </div>
        <div className="terminal-footer">Society Entry Management System</div>
      </div>
    </div>
  );
}
