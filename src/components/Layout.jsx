import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import sohoLogo from '../assets/soho-logo.png';

const ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  residents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21V9l9-6 9 6v12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21v-8h6v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  approvals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
      <path d="M17 5.5a3.5 3.5 0 0 1 0 7M21.5 20a5.5 5.5 0 0 0-4.5-6.4" strokeLinecap="round" />
    </svg>
  ),
  submissions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const ADMIN_LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/residents', label: 'Residents', icon: 'residents' },
  { to: '/admin/pending', label: 'Approvals', icon: 'approvals' },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/audit-log', label: 'Audit', icon: 'audit' },
];

const SECURITY_LINKS = [
  { to: '/security/residents', label: 'Residents', icon: 'residents' },
  { to: '/security/new', label: 'Add', icon: 'add' },
  { to: '/security/submissions', label: 'My submissions', icon: 'submissions' },
];

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function Layout({ children }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const links = profile?.role === 'admin' ? ADMIN_LINKS : SECURITY_LINKS;
  const activeLink = links.find((l) => location.pathname.startsWith(l.to));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img className="brand-mark" src={sohoLogo} alt="SOHO" />
          <div>
            <div className="topbar-title">
              Society Entry <span className="topbar-tag">Facility Control</span>
            </div>
            <div className="topbar-subtitle">{activeLink?.label || ''}</div>
          </div>
        </div>
        <div className="topbar-user">
          <div className="topbar-user-info">
            <span className="topbar-user-name">{profile?.full_name}</span>
            <span className={`pill ${profile?.role === 'admin' ? 'pill-approved' : 'pill-pending'}`}>{profile?.role}</span>
          </div>
          <div className="avatar-badge">{initials(profile?.full_name)}</div>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <nav>
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : '')} end>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="name">{profile?.full_name}</div>
              <div className="role">{profile?.role}</div>
            </div>
            <button className="btn" style={{ width: '100%' }} onClick={signOut}>
              Sign out
            </button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>

      <nav className="bottom-nav">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : '')} end>
            <span className="bottom-nav-icon">{ICONS[link.icon]}</span>
            <span className="bottom-nav-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
