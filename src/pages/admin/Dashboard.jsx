import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const ACTION_LABELS = {
  user_created: 'User created',
  resident_created: 'Resident added',
  resident_submitted: 'Resident submitted',
  resident_approved: 'Resident approved',
  resident_rejected: 'Resident rejected',
  resident_updated: 'Resident updated',
  resident_deleted: 'Resident deleted',
  vehicle_added: 'Vehicle added',
  vehicle_removed: 'Vehicle removed',
  issue_created: 'Issue logged',
  issue_updated: 'Issue updated',
  issue_deleted: 'Issue deleted',
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

const ICONS = {
  residents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  briefcase: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
    </svg>
  ),
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setStats).catch((err) => setError(err.message));
    api
      .get('/audit-log?page=1')
      .then((result) => setActivity(result.entries.slice(0, 6)))
      .catch(() => {});
  }, []);

  const residing = stats?.residing || 0;
  const ownerPct = residing > 0 ? Math.round((stats.owner_occupiers / residing) * 100) : 0;
  const tenantPct = residing > 0 ? Math.round((stats.tenants / residing) * 100) : 0;
  const hasPending = stats && stats.pending_approvals > 0;

  return (
    <Layout>
      <div className="top-bar"><h1>Dashboard</h1></div>

      {error && <div className="error-text">{error}</div>}
      {stats && (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="stat-tile-head">
                <div className="label">Residing in society</div>
                <div className="stat-icon">{ICONS.residents}</div>
              </div>
              <div className="value">{stats.residing}</div>
              <div className="stat-tile-note">{stats.total_records} records incl. off-site owners</div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile-head">
                <div className="label">Owner-occupied</div>
                <div className="stat-icon">{ICONS.key}</div>
              </div>
              <div className="value">{stats.owner_occupiers} <span className="value-sub">{ownerPct}%</span></div>
              <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${ownerPct}%` }} /></div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile-head">
                <div className="label">Tenants</div>
                <div className="stat-icon">{ICONS.briefcase}</div>
              </div>
              <div className="value">{stats.tenants} <span className="value-sub">{tenantPct}%</span></div>
              <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${tenantPct}%` }} /></div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile-head">
                <div className="label">Off-site owners</div>
                <div className="stat-icon">{ICONS.key}</div>
              </div>
              <div className="value">{stats.offsite_owners}</div>
              <div className="stat-tile-note">Landlords on record, not residing</div>
            </div>

            <div className={`stat-tile${hasPending ? ' stat-tile-alert' : ''}`}>
              <div className="stat-tile-head">
                <div className="label">Pending review</div>
                {hasPending && <span className="pill pill-solid">Action</span>}
              </div>
              <div className="value">{stats.pending_approvals} <span className="value-sub">in queue</span></div>
              {hasPending && <div className="stat-bar"><div className="stat-bar-fill stat-bar-fill-alert" style={{ width: '100%' }} /></div>}
            </div>
          </div>

          {hasPending && (
            <a href="/admin/pending" className="banner-cta">
              <div className="banner-cta-icon">{ICONS.alert}</div>
              <div className="banner-cta-body">
                <div className="banner-cta-title">
                  {stats.pending_approvals} submission{stats.pending_approvals === 1 ? '' : 's'} waiting for review
                </div>
                <div className="banner-cta-sub">Approve or reject to keep the queue current</div>
              </div>
              <span className="btn btn-primary" style={{ pointerEvents: 'none' }}>Review &rarr;</span>
            </a>
          )}
        </>
      )}

      <h2>Recent activity</h2>
      <div className="activity-list">
        {activity.length === 0 ? (
          <div className="card" style={{ color: 'var(--ink-dim)', fontSize: 13.5 }}>No activity yet.</div>
        ) : (
          activity.map((entry) => (
            <div key={entry.id} className="activity-row">
              <span className="activity-dot" />
              <span className="activity-label">{ACTION_LABELS[entry.action] || entry.action}</span>
              <span className="activity-time">{timeAgo(entry.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
