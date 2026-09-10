import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import sohoLogo from '../assets/soho-logo.png';
import MonkeyPasswordToggle from '../components/MonkeyPasswordToggle';
import GateMascot from '../components/GateMascot';

// Loose check just for choosing the mascot's "valid" reaction — the real
// validation is the input's own type="email" + required on submit.
function looksLikeEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const UserGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
  </svg>
);
const LockGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
  </svg>
);
const PinGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const RfidGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v7h-7M17 21v-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ArrowGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PhoneGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST';
}

export default function Login() {
  const { session, profile, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // 'email' | 'password' | null
  const [submitHover, setSubmitHover] = useState(false);
  // Tracks whether the password was ever revealed, so hiding it again
  // shows the "hidden again" pose rather than the initial focus pose.
  const [pwWasShown, setPwWasShown] = useState(false);
  // Brief success pose latch — navigation usually happens first, but if
  // routing is delayed the officer gives a thumbs-up rather than idling.
  const [mascotSuccess, setMascotSuccess] = useState(false);
  const navigate = useNavigate();
  const clock = useClock();

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
      setMascotSuccess(true);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleToggleShow() {
    setShowPassword((v) => {
      const next = !v;
      if (next) setPwWasShown(true);
      return next;
    });
  }

  function mascotState() {
    if (mascotSuccess) return 'success';
    if (error) return 'error';
    if (submitting) return 'signHover';
    if (focusedField === 'password') {
      if (showPassword) return 'passwordVisible';
      if (pwWasShown) return 'passwordHide';
      return password.length > 0 ? 'passwordTyping' : 'passwordFocus';
    }
    if (submitHover) return 'signHover';
    if (focusedField === 'email') return 'emailFocus';
    if (looksLikeEmail(email)) return 'emailValid';
    return 'idle';
  }

  function handleEmailChange(e) {
    setEmail(e.target.value);
    if (error) setError('');
  }
  function handlePasswordChange(e) {
    setPassword(e.target.value);
    if (error) setError('');
  }

  // --- Admin self-service password reset by email ---
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  async function handleResetRequest(e) {
    e.preventDefault();
    setResetBusy(true);
    setResetMsg('');
    try {
      const { message } = await api.post('/profile/request-reset', { email: resetEmail.trim() });
      setResetMsg(message || 'If this address belongs to an Admin account, a reset link has been sent.');
    } catch {
      // The endpoint is intentionally generic; even on an unexpected
      // error, don't reveal anything about the address.
      setResetMsg('If this address belongs to an Admin account, a reset link has been sent.');
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="gate-page">
      <div className="gate-terminal">
        <div className="gate-statusbar">
          <span className="gate-status-live">
            <span className="gate-status-dot" /> SYS ONLINE
          </span>
          <span className="gate-status-right">
            <span>ENC-256</span>
            <span className="gate-status-sep">|</span>
            <span className="gate-clock">{clock}</span>
          </span>
        </div>

        <div className="gate-body">
          <div className="gate-header">
            <span className="gate-header-title">
              <GateMascot state={mascotState()} />
              GATEHOUSE TERMINAL 01
            </span>
            <span className="gate-build">BUILD 2.4.19</span>
          </div>

          <div className="gate-screen">
            <div className="gate-brand">
              <img src={sohoLogo} alt="SOHO Society" className="gate-logo" />
              <div className="gate-brand-name">SOHO Society</div>
              <div className="gate-brand-sub">Physical Security &amp; Access Control Console</div>
              <div className="gate-locus">
                <span className="gate-locus-icon">{PinGlyph}</span>
                EAST PERIMETER GATE // BOOTH-A
              </div>
            </div>

            <form onSubmit={handleSubmit} className="gate-form">
              <label className="gate-label" htmlFor="email">
                Officer ID or Domain User
              </label>
              <div className="gate-input-wrap">
                <span className="gate-input-icon">{UserGlyph}</span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField((f) => (f === 'email' ? null : f))}
                  placeholder="officer.deshmukh@soho.estate"
                  required
                  autoFocus
                />
              </div>

              <div className="gate-label-row">
                <label className="gate-label" htmlFor="password">
                  Passcode / Terminal Key
                </label>
                <button
                  type="button"
                  className="gate-label-aux"
                  onClick={() => {
                    setResetOpen((v) => !v);
                    setResetMsg('');
                    if (!resetEmail) setResetEmail(email);
                  }}
                >
                  Emergency Reset?
                </button>
              </div>

              {resetOpen && (
                <div className="gate-reset">
                  <p className="gate-reset-note">
                    Admin accounts only. A reset link is emailed to the address on file. Security
                    officers: contact an Admin to have your passcode reset.
                  </p>
                  <div className="gate-input-wrap">
                    <span className="gate-input-icon">{UserGlyph}</span>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="admin@soho.estate"
                      aria-label="Admin email for password reset"
                    />
                  </div>
                  {resetMsg ? (
                    <p className="gate-reset-msg">{resetMsg}</p>
                  ) : (
                    <button
                      type="button"
                      className="gate-reset-send"
                      onClick={handleResetRequest}
                      disabled={resetBusy || !resetEmail.trim()}
                    >
                      {resetBusy ? 'Sending…' : 'Send reset link'}
                    </button>
                  )}
                </div>
              )}

              <div className="gate-input-wrap gate-password">
                <span className="gate-input-icon">{LockGlyph}</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField((f) => (f === 'password' ? null : f))}
                  placeholder="••••••••••••"
                  required
                />
                <MonkeyPasswordToggle
                  eyesCovered={!showPassword}
                  onToggle={handleToggleShow}
                  showPassword={showPassword}
                />
              </div>

              <div className="gate-bindrow">
                <label className="gate-bind">
                  <input type="checkbox" defaultChecked disabled />
                  <span className="gate-bind-box" aria-hidden="true" />
                  Bind terminal session (8h shift)
                </label>
                <span className="gate-ip">IP: 10.42.0.14</span>
              </div>

              {error && <div className="gate-error">{error}</div>}

              <button
                className="gate-submit"
                type="submit"
                disabled={submitting}
                onMouseEnter={() => setSubmitHover(true)}
                onMouseLeave={() => setSubmitHover(false)}
                onFocus={() => setSubmitHover(true)}
                onBlur={() => setSubmitHover(false)}
              >
                {submitting ? 'Authenticating…' : 'Authenticate & Enter Console'}
                {!submitting && <span className="gate-submit-arrow">{ArrowGlyph}</span>}
              </button>

              <div className="gate-divider">
                <span>OR HARDWARE CREDENTIAL</span>
              </div>

              <button className="gate-rfid" type="button" disabled aria-disabled="true" title="Hardware credential reader not available on this terminal">
                <span className="gate-rfid-icon">{RfidGlyph}</span>
                Scan Security RFID / Fob Token
              </button>

              <div className="gate-compliance">
                <span className="gate-compliance-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 3l9 16H3L12 3z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 10v4M12 17.5v.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span>
                  <strong>Restricted Gate Terminal:</strong> Authorized personnel only under ISO/IEC 27001 estate
                  protocol. Unauthorized access attempts are monitored and logged.
                </span>
              </div>
            </form>
          </div>

          <div className="gate-refrow">
            <span>SESSION REF: #SOHO-AUTH-9182</span>
            <span className="gate-dispatch">
              <span className="gate-dispatch-icon">{PhoneGlyph}</span> Dispatch: 104
            </span>
          </div>
        </div>

        <div className="gate-footer">
          SOHO Security Operating System · Core Rel 2026.9
          <br />© 2026 SOHO Estate Infrastructure. All Rights Reserved.
        </div>
      </div>
    </div>
  );
}
