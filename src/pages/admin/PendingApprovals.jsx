import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ResidentPhoto from '../../components/ResidentPhoto';
import { api } from '../../lib/api';
import { CheckCircle, XCircle, History } from '../../components/icons';

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

      <div className="queue-summary">
        <div>
          <div className="queue-summary-eyebrow">
            <span className="queue-dot" /> Approval queue
          </div>
          <div className="queue-summary-count">{pending.length} <span className="value-sub">actionable</span></div>
          <div className="queue-summary-sub">Submissions awaiting Admin review</div>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Pending submissions</h2>
      <div className="submission-list" style={{ marginBottom: 36 }}>
        {pending.map((item) => (
          <div key={item.id} className="submission-card">
            <ResidentPhoto path={item.photo_path} alt={item.resident_name} />
            <div className="submission-card-body">
              <div className="submission-card-top">
                <span className="resident-card-unit">{item.flat_number}</span>
                <span className="resident-card-name">{item.resident_name}</span>
                <span className={`pill ${item.occupancy_type === 'owner' ? 'pill-approved' : 'pill-pending'}`}>
                  {item.occupancy_type}
                </span>
              </div>
              <div className="resident-card-meta">
                Submitted {new Date(item.created_at).toLocaleDateString()}
              </div>

              {rejectingId === item.id ? (
                <div className="reject-panel">
                  <div className="reject-panel-title">&#9888; Specify disapproval reason</div>
                  <input
                    placeholder="e.g. Phone number does not match records on file"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn" onClick={() => { setRejectingId(null); setReason(''); }}>Cancel</button>
                    <button className="btn btn-danger" disabled={busyId === item.id} onClick={() => handleReject(item.id)}>
                      Confirm reject
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-danger" disabled={busyId === item.id} onClick={() => setRejectingId(item.id)}>
                    <span className="btn-icon">{XCircle}</span> Reject
                  </button>
                  <button className="btn btn-primary" disabled={busyId === item.id} onClick={() => handleApprove(item.id)}>
                    <span className="btn-icon">{CheckCircle}</span> Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {pending.length === 0 && (
          <div className="card" style={{ color: 'var(--ink-dim)' }}>Nothing pending.</div>
        )}
      </div>

      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="detail-icon">{History}</span> Review history
      </h2>
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
