import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { UserPlus, Mail, CheckCircle, Lock } from '../../components/icons';

const UserIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
  </svg>
);
const ShieldIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MIN_PASSWORD_LENGTH = 10;

function CreateUserForm({ onCreated }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('security');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await api.post('/users', { email: email.trim(), full_name: fullName.trim(), role });
      setSuccess(`Invitation sent to ${email}. They'll set their own password on first login.`);
      setEmail('');
      setFullName('');
      setRole('security');
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
      <div className="form-row">
        <label htmlFor="full_name">Full name</label>
        <div className="input-icon-wrap">
          <span className="input-icon">{UserIcon}</span>
          <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="email">Email</label>
        <div className="input-icon-wrap">
          <span className="input-icon">{Mail}</span>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="form-row">
        <label>Role</label>
        <div className="segmented segmented-full">
          <button type="button" className={role === 'security' ? 'active' : ''} onClick={() => setRole('security')}>
            <span className="segmented-icon">{ShieldIcon}</span> Security
          </button>
          <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>
            <span className="segmented-icon">{UserPlus}</span> Admin
          </button>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {success && (
        <div className="field-flag field-flag-ok" style={{ marginTop: 10, fontSize: 13 }}>
          {CheckCircle} {success}
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 14, width: '100%' }}>
        {submitting ? 'Sending invite...' : 'Send invite'}
      </button>
    </form>
  );
}

function ResetPasswordRow({ user, onDone }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pw.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (pw !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.post('/users', { action: 'set-password', user_id: user.id, password: pw });
      setDone(true);
      setPw('');
      setConfirm('');
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => { setOpen(true); setDone(false); }}>
        <span className="btn-icon">{Lock}</span> Set new password
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="user-reset-form">
      <p className="user-reset-hint">
        Set a working password and hand it to <strong>{user.full_name}</strong> in person. It takes
        effect immediately — they will not be asked to change it on next login.
      </p>
      <div className="form-row">
        <label htmlFor={`pw-${user.id}`}>New password (min. {MIN_PASSWORD_LENGTH} characters)</label>
        <input
          id={`pw-${user.id}`}
          type="text"
          autoComplete="off"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
      </div>
      <div className="form-row">
        <label htmlFor={`pwc-${user.id}`}>Confirm password</label>
        <input
          id={`pwc-${user.id}`}
          type="text"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error && <div className="error-text">{error}</div>}
      {done && (
        <div className="field-flag field-flag-ok" style={{ marginTop: 8, fontSize: 13 }}>
          {CheckCircle} Password updated. Give it to {user.full_name} directly.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <button className="btn btn-sm" type="button" onClick={() => { setOpen(false); setError(''); }}>
          Close
        </button>
      </div>
    </form>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  function load() {
    setLoading(true);
    api
      .get('/users')
      .then((res) => setUsers(res.users || []))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> User management
        </span>
        <h1>Users</h1>
        <div className="directory-subtitle">Invite Admin/Security accounts and reset passwords</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Create user</h2>
          <CreateUserForm onCreated={load} />
        </section>

        <section>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Existing accounts</h2>
          {loading ? (
            <div style={{ color: 'var(--ink-dim)' }}>Loading…</div>
          ) : loadError ? (
            <div className="error-text">{loadError}</div>
          ) : (
            <div className="user-list">
              {users.map((u) => (
                <div key={u.id} className="user-row">
                  <div className="user-row-main">
                    <div className="user-row-name">
                      {u.full_name}
                      <span className={`pill ${u.role === 'admin' ? 'pill-approved' : 'pill-pending'}`} style={{ marginLeft: 8 }}>
                        {u.role}
                      </span>
                      {u.must_change_password && (
                        <span className="pill" style={{ marginLeft: 6 }}>invite pending</span>
                      )}
                    </div>
                    <div className="user-row-email">{u.email || '—'}</div>
                  </div>
                  <div className="user-row-action">
                    <ResetPasswordRow user={u} onDone={load} />
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div style={{ color: 'var(--ink-dim)', padding: '12px 0' }}>No users yet.</div>
              )}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
