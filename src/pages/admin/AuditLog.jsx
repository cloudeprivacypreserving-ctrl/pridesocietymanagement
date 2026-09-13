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
  audit_log_purged: { icon: Trash, tone: 'danger' },
};

function locationOf(entry) {
  const parts = [entry.city, entry.region, entry.country].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

// Local YYYY-MM-DD for the date inputs' min/max/default.
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function PurgePanel({ onPurged }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  async function purge(body, confirmMsg) {
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const res = await api.delete('/audit-log', body);
      setResult(`Deleted ${res.deleted_count} entr${res.deleted_count === 1 ? 'y' : 'ies'}.`);
      onPurged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function purgeOlderThan30Days() {
    const before = isoDaysAgo(30);
    purge({ before }, `Delete all audit log entries older than ${before}? This cannot be undone.`);
  }

  function purgeRange(e) {
    e.preventDefault();
    if (!from && !to) {
      setError('Pick at least a start or end date');
      return;
    }
    purge(
      { from: from || null, to: to || null },
      `Delete audit log entries ${from ? `from ${from} ` : ''}${to ? `through ${to}` : 'onward'}? This cannot be undone.`
    );
  }

  return (
    <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Free up space</div>
          <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 2 }}>
            Permanently delete old audit log entries.
          </div>
        </div>
        <button className="btn btn-sm btn-danger" onClick={purgeOlderThan30Days} disabled={busy}>
          <span className="btn-icon">{Trash}</span> Delete older than 30 days
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ background: 'none', border: 'none', color: 'var(--ink-dim)', fontSize: 12, marginTop: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
      >
        {open ? 'Hide custom range' : 'Delete a custom date range…'}
      </button>

      {open && (
        <form onSubmit={purgeRange} style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label htmlFor="purge_from">From</label>
            <input id="purge_from" type="date" value={from} max={isoToday()} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label htmlFor="purge_to">To</label>
            <input id="purge_to" type="date" value={to} max={isoToday()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-danger" type="submit" disabled={busy}>
            {busy ? 'Deleting…' : 'Delete range'}
          </button>
        </form>
      )}

      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      {result && (
        <div className="field-flag field-flag-ok" style={{ marginTop: 10, fontSize: 13 }}>
          {CheckCircle} {result}
        </div>
      )}
    </div>
  );
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ entries: [], total: 0, page_size: 50 });
  const [error, setError] = useState('');

  function load() {
    api.get(`/audit-log?page=${page}`).then(setResult).catch((err) => setError(err.message));
  }

  useEffect(load, [page]);

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

      <PurgePanel
        onPurged={() => {
          setPage(1);
          load();
        }}
      />

      {error && <div className="error-text">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
              <th>Location</th>
              <th>IP</th>
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
                  <td className="dim" style={{ maxWidth: 280, wordBreak: 'break-word', fontSize: 12.5 }}>
                    {entry.details ? JSON.stringify(entry.details) : '—'}
                  </td>
                  <td className="dim" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{locationOf(entry)}</td>
                  <td className="dim" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    {entry.ip_address || '—'}
                  </td>
                  <td className="dim">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
            {result.entries.length === 0 && (
              <tr><td colSpan={6} style={{ color: 'var(--ink-dim)' }}>No entries yet.</td></tr>
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
