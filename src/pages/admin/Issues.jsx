import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Trash, Pencil } from '../../components/icons';

const PRIORITY_PILL = { low: 'pill-approved', medium: 'pill-pending', high: 'pill-rejected' };
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const STATUS_PILL = { open: 'pill-pending', in_progress: 'pill-solid', resolved: 'pill-approved' };

function CreateIssueForm({ onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/issues', { title: title.trim(), description: description.trim() || null, priority });
      setTitle('');
      setDescription('');
      setPriority('medium');
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <div className="form-row">
        <label htmlFor="issue_title">Title</label>
        <input id="issue_title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="form-row">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label htmlFor="issue_description">Description</label>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Optional</span>
        </div>
        <textarea
          id="issue_description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ resize: 'vertical' }}
        />
      </div>
      <div className="form-row">
        <label>Priority</label>
        <div className="segmented segmented-full">
          <button type="button" className={priority === 'low' ? 'active' : ''} onClick={() => setPriority('low')}>
            Low
          </button>
          <button type="button" className={priority === 'medium' ? 'active' : ''} onClick={() => setPriority('medium')}>
            Medium
          </button>
          <button type="button" className={priority === 'high' ? 'active' : ''} onClick={() => setPriority('high')}>
            High
          </button>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 14, width: '100%' }}>
        {submitting ? 'Adding…' : 'Add issue'}
      </button>
    </form>
  );
}

function IssueRow({ issue, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description || '');
  const [priority, setPriority] = useState(issue.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveEdits(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/issues/${issue.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
      });
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/issues/${issue.id}`, { status });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete issue "${issue.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/issues/${issue.id}`);
      onChanged?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form className="card" onSubmit={saveEdits} style={{ marginBottom: 10 }}>
        <div className="form-row">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Description</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <div className="form-row">
          <label>Priority</label>
          <div className="segmented segmented-full">
            <button type="button" className={priority === 'low' ? 'active' : ''} onClick={() => setPriority('low')}>Low</button>
            <button type="button" className={priority === 'medium' ? 'active' : ''} onClick={() => setPriority('medium')}>Medium</button>
            <button type="button" className={priority === 'high' ? 'active' : ''} onClick={() => setPriority('high')}>High</button>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14.5 }}>{issue.title}</strong>
            <span className={`pill ${PRIORITY_PILL[issue.priority]}`}>{issue.priority}</span>
            <span className={`pill ${STATUS_PILL[issue.status]}`}>{STATUS_LABEL[issue.status]}</span>
          </div>
          {issue.description && (
            <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {issue.description}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 8 }}>
            Opened {new Date(issue.created_at).toLocaleDateString()}
            {issue.resolved_at && ` · Resolved ${new Date(issue.resolved_at).toLocaleDateString()}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-sm" onClick={() => setEditing(true)} disabled={busy}>
            <span className="btn-icon">{Pencil}</span> Edit
          </button>
          <button className="btn btn-sm btn-danger" onClick={handleDelete} disabled={busy}>
            <span className="btn-icon">{Trash}</span>
          </button>
        </div>
      </div>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {issue.status !== 'open' && (
          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus('open')}>Mark open</button>
        )}
        {issue.status !== 'in_progress' && (
          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus('in_progress')}>Start progress</button>
        )}
        {issue.status !== 'resolved' && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => setStatus('resolved')}>Mark resolved</button>
        )}
      </div>
    </div>
  );
}

export default function Issues() {
  const [result, setResult] = useState({ entries: [], open_count: 0 });
  const [filter, setFilter] = useState('active'); // 'active' | 'resolved' | 'all'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    const statusParam = filter === 'resolved' ? '&status=resolved' : '';
    api
      .get(`/issues?page=1${statusParam}`)
      .then((res) => setResult(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filter]);

  const visible =
    filter === 'active' ? result.entries.filter((i) => i.status !== 'resolved') : result.entries;

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> Issue tracker
        </span>
        <h1>Issues</h1>
        <div className="directory-subtitle">
          {result.open_count} open/in-progress issue{result.open_count === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Log a new issue</h2>
          <CreateIssueForm onCreated={load} />
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Issues</h2>
            <div className="filter-pills">
              <button className={`filter-pill${filter === 'active' ? ' active' : ''}`} onClick={() => setFilter('active')}>
                Open &amp; in progress
              </button>
              <button className={`filter-pill${filter === 'resolved' ? ' active' : ''}`} onClick={() => setFilter('resolved')}>
                Resolved
              </button>
              <button className={`filter-pill${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
                All
              </button>
            </div>
          </div>

          {error && <div className="error-text">{error}</div>}
          {loading ? (
            <div style={{ color: 'var(--ink-dim)' }}>Loading…</div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              {visible.map((issue) => (
                <IssueRow key={issue.id} issue={issue} onChanged={load} />
              ))}
              {visible.length === 0 && (
                <div className="card" style={{ color: 'var(--ink-dim)' }}>No issues here.</div>
              )}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
