import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [residents, setResidents] = useState([]);
  const [q, setQ] = useState('');
  const [flat, setFlat] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function search() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (flat) params.set('flat', flat);
      const data = await api.get(`/residents?${params.toString()}`);
      setResidents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => ({
      all: residents.length,
      owner: residents.filter((r) => r.occupancy_type === 'owner').length,
      tenant: residents.filter((r) => r.occupancy_type === 'tenant').length,
    }),
    [residents]
  );

  const filtered = filter === 'all' ? residents : residents.filter((r) => r.occupancy_type === filter);

  return (
    <Layout>
      <div className="directory-header">
        <div>
          <div className="directory-title-row">
            <h1>Residents directory</h1>
            <span className="pill pill-approved">{counts.all} total</span>
          </div>
          <div className="directory-subtitle">Active tower occupancy and resident records</div>
        </div>
        <Link className="btn btn-primary" to="/admin/residents/new">+ Add resident</Link>
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
        <button className="btn btn-primary" onClick={search}>Search</button>
      </div>

      <div className="filter-pills">
        <button className={`filter-pill${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          All ({counts.all})
        </button>
        <button className={`filter-pill${filter === 'owner' ? ' active' : ''}`} onClick={() => setFilter('owner')}>
          Owners ({counts.owner})
        </button>
        <button className={`filter-pill${filter === 'tenant' ? ' active' : ''}`} onClick={() => setFilter('tenant')}>
          Tenants ({counts.tenant})
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--ink-dim)' }}>Loading...</div>
      ) : (
        <div className="resident-card-list">
          {filtered.map((r) => (
            <ResidentCard key={r.id} resident={r} linkTo={`/admin/residents/${r.id}`} linkLabel="View / Edit" />
          ))}
          {filtered.length === 0 && (
            <div style={{ color: 'var(--ink-dim)', padding: '20px 0' }}>No residents match.</div>
          )}
        </div>
      )}
    </Layout>
  );
}
