import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ADMIN_LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/residents', label: 'Residents' },
  { to: '/admin/pending', label: 'Pending approvals' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/audit-log', label: 'Audit log' },
];

const SECURITY_LINKS = [
  { to: '/security/residents', label: 'Residents' },
  { to: '/security/new', label: 'Add resident' },
  { to: '/security/submissions', label: 'My submissions' },
];

export default function Layout({ children }) {
  const { profile, signOut } = useAuth();
  const links = profile?.role === 'admin' ? ADMIN_LINKS : SECURITY_LINKS;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Society Entry</h2>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 32, fontSize: 13, color: 'var(--ink-dim)' }}>
          <div>{profile?.full_name}</div>
          <div style={{ textTransform: 'capitalize' }}>{profile?.role}</div>
          <button className="btn" style={{ marginTop: 10, width: '100%' }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
