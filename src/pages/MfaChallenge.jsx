import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import sohoLogo from '../assets/soho-logo.png';
import { Lock } from '../components/icons';

// Shown after password sign-in when the account has a verified TOTP
// factor but this session hasn't completed the AAL2 challenge yet.
export default function MfaChallenge() {
  const { session, loading, refreshMfaStatus, signOut } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingFactor, setLoadingFactor] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (cancelled) return;
      if (listError) {
        setError(listError.message);
      } else {
        const verified = (data?.totp || []).find((f) => f.status === 'verified');
        setFactorId(verified?.id || null);
        if (!verified) setError('No verified authenticator found on this account.');
      }
      setLoadingFactor(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      await refreshMfaStatus();
      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid code — try again');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="auth-page">
      <div className="terminal-frame">
        <div className="terminal-screen">
          <div className="terminal-brand">
            <img className="brand-mark" src={sohoLogo} alt="SOHO" style={{ width: 44, height: 44, borderRadius: 12 }} />
            <div>
              <div className="terminal-brand-title">
                <span className="input-icon" style={{ position: 'static', transform: 'none', width: 18, height: 18 }}>{Lock}</span>
                Enter your code
              </div>
              <div className="terminal-brand-sub">Two-factor verification</div>
            </div>
          </div>

          <div className="terminal-notice">
            Open your authenticator app and enter the current 6-digit code for this account.
          </div>

          {loadingFactor ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-dim)' }}>Loading…</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="mfa_code">6-digit code</label>
                <input
                  id="mfa_code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="123456"
                  autoFocus
                  required
                  disabled={!factorId}
                />
              </div>
              {error && <div className="error-text">{error}</div>}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={submitting || !factorId}
                style={{ width: '100%', marginTop: 4 }}
              >
                {submitting ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={signOut}
            style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: 12, marginTop: 16, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Sign out instead
          </button>
        </div>
        <div className="terminal-footer">Society Entry Management System</div>
      </div>
    </div>
  );
}
