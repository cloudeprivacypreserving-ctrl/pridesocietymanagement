import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

export default function ResidentsList() {
  const [residents, setResidents] = useState([]);
  const [q, setQ] = useState('');
  const [flat, setFlat] = useState('');
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

  return (
    <Layout>
      <div className="top-bar">
        <h1 style={{ margin: 0 }}>Residents</h1>
      </div>

      <div className="search-row">
        <input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <input placeholder="Search by flat number" value={flat} onChange={(e) => setFlat(e.target.value)} />
        <button className="btn btn-primary" onClick={search}>Search</button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Flat</th>
              <th>Name</th>
              <th>Type</th>
              <th>Phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.id}>
                <td>{r.flat_number}</td>
                <td>{r.resident_name}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.occupancy_type}</td>
                <td>{r.phone}</td>
                <td><Link to={`/security/residents/${r.id}`}>View</Link></td>
              </tr>
            ))}
            {residents.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-dim)' }}>No residents found.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
