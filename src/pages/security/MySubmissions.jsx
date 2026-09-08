import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const PILL = { pending: 'pill-pending', approved: 'pill-approved', rejected: 'pill-rejected' };

export default function MySubmissions() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/pending').then(setItems).catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <h1>My submissions</h1>
      {error && <div className="error-text">{error}</div>}
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
              <td>{item.rejection_reason || '—'}</td>
              <td>{new Date(item.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} style={{ color: 'var(--ink-dim)' }}>No submissions yet.</td></tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
