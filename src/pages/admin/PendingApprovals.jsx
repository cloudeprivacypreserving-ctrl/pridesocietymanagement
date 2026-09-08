import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const PILL = { pending: 'pill-pending', approved: 'pill-approved', rejected: 'pill-rejected' };

export default function PendingApprovals() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  function load() {
    api.get('/pending').then(setItems).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleApprove(id) {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/pending/${id}/approve`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id) {
    if (!reason.trim()) {
      setError('A rejection reason is required');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.post(`/pending/${id}/reject`, { reason: reason.trim() });
      setRejectingId(null);
      setReason('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pending = items.filter((i) => i.status === 'pending');
  const reviewed = items.filter((i) => i.status !== 'pending');

  return (
    <Layout>
      <div className="top-bar"><h1>Pending approvals</h1></div>
      {error && <div className="error-text">{error}</div>}

      <div className="table-wrap" style={{ marginBottom: 36 }}>
        <table>
          <thead>
            <tr>
              <th>Flat</th>
              <th>Name</th>
              <th>Type</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((item) => (
              <tr key={item.id}>
                <td>{item.flat_number}</td>
                <td>{item.resident_name}</td>
                <td style={{ textTransform: 'capitalize' }}>{item.occupancy_type}</td>
                <td className="dim">{new Date(item.created_at).toLocaleDateString()}</td>
                <td>
                  {rejectingId === item.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        placeholder="Reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={{ width: 160 }}
                      />
                      <button className="btn btn-danger" disabled={busyId === item.id} onClick={() => handleReject(item.id)}>
                        Confirm
                      </button>
                      <button className="btn" onClick={() => { setRejectingId(null); setReason(''); }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" disabled={busyId === item.id} onClick={() => handleApprove(item.id)}>
                        Approve
                      </button>
                      <button className="btn btn-danger" disabled={busyId === item.id} onClick={() => setRejectingId(item.id)}>
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-dim)' }}>Nothing pending.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>History</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Flat</th>
              <th>Name</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {reviewed.map((item) => (
              <tr key={item.id}>
                <td>{item.flat_number}</td>
                <td>{item.resident_name}</td>
                <td><span className={`pill ${PILL[item.status]}`}>{item.status}</span></td>
                <td className="dim">{item.rejection_reason || '—'}</td>
                <td className="dim">{item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {reviewed.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-dim)' }}>No history yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
