// Role-based avatar for Admin / Security accounts. There's no photo
// upload for staff accounts, so instead of plain initials this renders a
// small illustrated badge that differs by role — a crested shield for
// Admin, a peaked cap for Security — each tinted with that role's color.
// Pure inline SVG, no assets.
const AdminGlyph = (
  <svg viewBox="0 0 32 32" fill="none">
    <path
      d="M16 3l10 3.6v7.2c0 7-4.3 11.9-10 14.2C10.3 25.7 6 20.8 6 13.8V6.6L16 3z"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M11.5 16.2l3 3 6-6.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SecurityGlyph = (
  <svg viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="13" fill="currentColor" fillOpacity="0.16" />
    <path
      d="M8 14c0-4.4 3.6-8 8-8s8 3.6 8 8"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <rect x="7" y="13.5" width="18" height="4.6" rx="2.3" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M11 18.5v3a5 5 0 0 0 10 0v-3"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <circle cx="16" cy="16" r="1.5" fill="var(--surface, #fff)" />
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
