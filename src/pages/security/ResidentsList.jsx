import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ResidentCard from '../../components/ResidentCard';
import { api } from '../../lib/api';

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
  </svg>
);
const UnitIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 21V9l9-6 9 6v12" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 21v-8h6v8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ResidentsList() {
  const [result, setResult] = useState({ entries: [], page: 1, page_size: 50, total: 0, counts: { all: 0, owner: 0, tenant: 0 } });
  const [q, setQ] = useState('');
  const [flat, setFlat] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchResidents({ q, flat, filter, page: pageArg }) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (flat) params.set('flat', flat);
    if (filter !== 'all') params.set('occupancy_type', filter);
    params.set('page', String(pageArg));
    return api.get(`/residents?${params.toString()}`);
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchResidents({ q, flat, filter, page })
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  function handleSearchClick() {
    if (page !== 1) {
      setPage(1);
    } else {
      setLoading(true);
      setError('');
      fetchResidents({ q, flat, filter, page: 1 })
        .then(setResult)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }

  function handleFilterChange(next) {
    setFilter(next);
    setPage(1);
  }

  const totalPages = Math.max(Math.ceil(result.total / result.page_size), 1);

  return (
    <Layout>
      <div className="directory-header">
        <div>
          <div className="directory-title-row">
            <h1>Residents directory</h1>
            <span className="pill pill-approved">{result.counts.all} total</span>
          </div>
          <div className="directory-subtitle">Active tower occupancy and resident records</div>
        </div>
      </div>

      <div className="search-row">
        <div className="input-icon-wrap">
          <span className="input-icon">{SearchIcon}</span>
          <input placeholder="Search resident name..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="input-icon-wrap" style={{ maxWidth: 160 }}>
          <span className="input-icon">{UnitIcon}</span>
          <input placeholder="e.g. A-101" value={flat} onChange={(e) => setFlat(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleSearchClick}>Search</button>
      </div>

      <div className="filter-pills">
        <button className={`filter-pill${filter === 'all' ? ' active' : ''}`} onClick={() => handleFilterChange('all')}>
          All ({result.counts.all})
        </button>
        <button className={`filter-pill${filter === 'owner' ? ' active' : ''}`} onClick={() => handleFilterChange('owner')}>
          Owners ({result.counts.owner})
        </button>
        <button className={`filter-pill${filter === 'tenant' ? ' active' : ''}`} onClick={() => handleFilterChange('tenant')}>
          Tenants ({result.counts.tenant})
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--ink-dim)' }}>Loading...</div>
      ) : (
        <>
          <div className="resident-card-list">
            {result.entries.map((r) => (
              <ResidentCard key={r.id} resident={r} linkTo={`/security/residents/${r.id}`} linkLabel="View" />
            ))}
            {result.entries.length === 0 && (
              <div style={{ color: 'var(--ink-dim)', padding: '20px 0' }}>No residents match.</div>
            )}
          </div>

          {result.total > result.page_size && (
            <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Page {page} of {totalPages}</span>
              <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
