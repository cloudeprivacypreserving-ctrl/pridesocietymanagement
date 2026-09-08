import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setStats).catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <h1>Dashboard</h1>
      {error && <div className="error-text">{error}</div>}
      {stats && (
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="label">Total residents</div>
            <div className="value">{stats.total_residents}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Owners</div>
            <div className="value">{stats.total_owners}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Tenants</div>
            <div className="value">{stats.total_tenants}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Pending approvals</div>
            <div className="value">{stats.pending_approvals}</div>
          </div>
        </div>
      )}
    </Layout>
  );
}
