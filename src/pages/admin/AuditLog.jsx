import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { History, UserPlus, CheckCircle, XCircle, Pencil, Trash, Car, Inbox } from '../../components/icons';

const ACTION_META = {
  user_created: { icon: UserPlus, tone: 'accent' },
  resident_created: { icon: CheckCircle, tone: 'green' },
  resident_submitted: { icon: Inbox, tone: 'amber' },
  resident_approved: { icon: CheckCircle, tone: 'green' },
  resident_rejected: { icon: XCircle, tone: 'danger' },
  resident_updated: { icon: Pencil, tone: 'accent' },
  resident_deleted: { icon: Trash, tone: 'danger' },
  vehicle_added: { icon: Car, tone: 'accent' },
  vehicle_removed: { icon: Car, tone: 'danger' },
};

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ entries: [], total: 0, page_size: 50 });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/audit-log?page=${page}`).then(setResult).catch((err) => setError(err.message));
  }, [page]);

  const totalPages = Math.max(Math.ceil(result.total / result.page_size), 1);

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          {History} Compliance record
        </span>
        <h1>Audit log</h1>
        <div className="directory-subtitle">Chronological record of Admin and Security actions</div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry) => {
              const meta = ACTION_META[entry.action] || { icon: History, tone: 'accent' };
              return (
                <tr key={entry.id}>
                  <td>
                    <span className={`audit-action audit-action-${meta.tone}`}>
                      <span className="audit-action-icon">{meta.icon}</span>
                      {entry.action}
                    </span>
                  </td>
                  <td className="dim" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>
                    {entry.target_table ? `${entry.target_table} · ${entry.target_id}` : '—'}
                  </td>
                  <td className="dim" style={{ maxWidth: 320, wordBreak: 'break-word', fontSize: 12.5 }}>
                    {entry.details ? JSON.stringify(entry.details) : '—'}
                  </td>
                  <td className="dim">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
            {result.entries.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--ink-dim)' }}>No entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Page {page} of {totalPages}</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </Layout>
  );
}
