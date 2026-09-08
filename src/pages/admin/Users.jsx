import { useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { UserPlus, Mail, CheckCircle } from '../../components/icons';

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

export default function Users() {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> User management
        </span>
        <h1>Create user</h1>
        <div className="directory-subtitle">Invite a new Admin or Security account by email</div>
      </div>

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
    </Layout>
  );
}
