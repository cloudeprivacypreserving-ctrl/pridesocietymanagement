// Role-based avatar for Admin / Security accounts. There's no photo
// upload for staff accounts, so instead of plain initials this renders a
// small flat-icon-style badge that differs by role: a person wearing a
// necktie with a star badge for Admin, a person in a peaked cap for
// Security. Solid-fill glyphs on a solid role-colored circle — the
// classic "Flaticon" look. Pure inline SVG, no assets.
const AdminGlyph = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="8.2" r="3.7" fill="#fff" />
    <path
      d="M4.6 20.5c.5-4.3 3.7-7 7.4-7s6.9 2.7 7.4 7c.1.6-.4 1.1-1 1.1H5.6c-.6 0-1.1-.5-1-1.1z"
      fill="#fff"
    />
    <path d="M12 13.5l1.6 2.6-1.6 3.4-1.6-3.4z" fill="currentColor" />
    <path
      d="M17.2 5.3l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z"
      fill="#fff"
    />
  </svg>
);

const SecurityGlyph = (
  <svg viewBox="0 0 24 24">
    <path
      d="M6.4 10.5c0-3.3 2.5-6 5.6-6s5.6 2.7 5.6 6"
      fill="none"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <rect x="5" y="9.6" width="14" height="3.6" rx="1.8" fill="#fff" />
    <circle cx="12" cy="11.4" r="1.15" fill="currentColor" />
    <path
      d="M5 20.6c.4-3.9 3.3-6.4 7-6.4s6.6 2.5 7 6.4c.1.6-.4 1.1-1 1.1H6c-.6 0-1.1-.5-1-1.1z"
      fill="#fff"
    />
  </svg>
);

export default function RoleAvatar({ role, size = 32, className = '' }) {
  const isAdmin = role === 'admin';
  const classes = ['role-avatar', isAdmin ? 'role-avatar-admin' : 'role-avatar-security', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={{ width: size, height: size }} aria-hidden="true">
      {isAdmin ? AdminGlyph : SecurityGlyph}
    </div>
  );
}
