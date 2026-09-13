import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import sohoLogo from '../assets/soho-logo.png';
import { Lock } from '../components/icons';

// Forced one-time setup: an Admin account with no verified TOTP factor is
// routed here (see ProtectedRoute) before it can use the app at all.
export default function MfaSetup() {
  const { session, loading, refreshMfaStatus, signOut } = useAuth();
  const [enrolling, setEnrolling] = useState(true);
  const [factorId, setFactorId] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function startEnroll() {
      setEnrolling(true);
      setError('');
      try {
        // Clear out any prior *unverified* attempt for this account first —
        // Supabase caps how many unverified TOTP factors an account can
        // hold, and a user who reloads this page mid-setup would otherwise
        // pile them up. Note: listFactors().data.totp only contains
        // *verified* factors — unverified ones only show up in .all.
        const { data: existing } = await supabase.auth.mfa.listFactors();
        const stale = (existing?.all || []).filter((f) => f.factor_type === 'totp' && f.status === 'unverified');
        for (const f of stale) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }

        const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (enrollError) throw enrollError;
        if (cancelled) return;
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to start MFA setup');
      } finally {
        if (!cancelled) setEnrolling(false);
      }
    }
    startEnroll();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(e) {
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
                Set up two-factor login
              </div>
              <div className="terminal-brand-sub">Required for Admin accounts</div>
            </div>
          </div>

          <div className="terminal-notice">
            Scan the QR code below with an authenticator app (Google Authenticator, Authy, 1Password, etc.),
            then enter the 6-digit code it shows to finish setup. You'll need this app every time you sign in.
          </div>

          {enrolling ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-dim)' }}>Preparing setup…</div>
          ) : qrCode ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 14px' }}>
                <img
                  src={qrCode}
                  alt="Scan with your authenticator app"
                  style={{ width: 176, height: 176, borderRadius: 8, border: '1px solid var(--line)', background: '#fff', padding: 8 }}
                />
              </div>
              {secret && (
                <div style={{ fontSize: 12, color: 'var(--ink-dim)', textAlign: 'center', marginBottom: 16 }}>
                  Can't scan it? Enter this key manually:
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12.5,
                      marginTop: 4,
                      wordBreak: 'break-all',
                      color: 'var(--ink)',
                    }}
                  >
                    {secret}
                  </div>
                </div>
              )}

              <form onSubmit={handleVerify}>
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
                  />
                </div>
                {error && <div className="error-text">{error}</div>}
                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 4 }}>
                  {submitting ? 'Verifying…' : 'Verify & enable'}
                </button>
              </form>
            </>
          ) : (
            error && <div className="error-text">{error}</div>
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
