import { useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

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
      <h1>Create user</h1>
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="form-row">
          <label htmlFor="full_name">Full name</label>
          <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="role">Role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="security">Security</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <div className="error-text">{error}</div>}
        {success && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 6 }}>{success}</div>}
        <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
          {submitting ? 'Sending invite...' : 'Send invite'}
        </button>
      </form>
    </Layout>
  );
}
