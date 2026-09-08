import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

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
      <div className="top-bar"><h1>Audit log</h1></div>
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
            {result.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.action}</td>
                <td className="dim" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>
                  {entry.target_table ? `${entry.target_table} · ${entry.target_id}` : '—'}
                </td>
                <td className="dim" style={{ maxWidth: 320, wordBreak: 'break-word', fontSize: 12.5 }}>
                  {entry.details ? JSON.stringify(entry.details) : '—'}
                </td>
                <td className="dim">{new Date(entry.created_at).toLocaleString()}</td>
              </tr>
            ))}
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
