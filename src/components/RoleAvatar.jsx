// Role-based avatar for Admin / Security accounts. There's no photo
// upload for staff accounts, so this shows a role-appropriate flat icon
// instead of plain initials: a shield-with-person icon for Admin (account
// management), a shield-with-checkmark icon for Security (protection /
// access control).
import adminIcon from '../assets/admin.png';
import shieldIcon from '../assets/shield.png';

export default function RoleAvatar({ role, size = 32, className = '' }) {
  const isAdmin = role === 'admin';
  const classes = ['role-avatar', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={{ width: size, height: size }}>
      <img src={isAdmin ? adminIcon : shieldIcon} alt="" aria-hidden="true" />
    </div>
  );
}
