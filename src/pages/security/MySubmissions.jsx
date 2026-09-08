import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { ClipboardList } from '../../components/icons';

const PILL = { pending: 'pill-pending', approved: 'pill-approved', rejected: 'pill-rejected' };

export default function MySubmissions() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // A single guard's own submission count is naturally small (unlike the
    // admin-wide history), so it's fine to combine the always-full pending
    // list with the first page of reviewed history into one chronological
    // view here rather than paginating this page too.
    Promise.all([api.get('/pending?status=pending'), api.get('/pending?status=history&page=1')])
      .then(([pending, history]) => {
        const combined = [...pending.entries, ...history.entries].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        setItems(combined);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">{ClipboardList} My submissions</span>
        <h1>Submission status</h1>
        <div className="directory-subtitle">Track residents you've submitted for Admin approval</div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Flat</th>
              <th>Name</th>
              <th>Status</th>
              <th>Reason (if rejected)</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.flat_number}</td>
                <td>{item.resident_name}</td>
                <td><span className={`pill ${PILL[item.status]}`}>{item.status}</span></td>
                <td className="dim">{item.rejection_reason || '—'}</td>
                <td className="dim">{new Date(item.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-dim)' }}>No submissions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
