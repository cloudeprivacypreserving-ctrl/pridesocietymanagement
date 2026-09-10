import { Link } from 'react-router-dom';
import { occupancyLabel } from '../lib/occupancy';

const PhoneIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CarIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0zM3 17l1.5-6h15L21 17M6 11l1-3h10l1 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function ResidentCard({ resident, linkTo, linkLabel }) {
  const leaseText = resident.occupancy_type === 'tenant' && resident.lease_expiry_date
    ? `Lease: ${formatDate(resident.lease_expiry_date)}`
    : null;

  return (
    <div className="resident-card">
      <div className="resident-card-unit">{resident.flat_number}</div>
      <div className="resident-card-body">
        <div className="resident-card-top">
          <span className="resident-card-name">{resident.resident_name}</span>
          <span className={`pill ${resident.occupancy_type !== 'tenant' ? 'pill-approved' : 'pill-pending'}`}>
            {occupancyLabel(resident.occupancy_type)}
          </span>
        </div>
        <div className="resident-card-meta">
          <span className="resident-card-meta-icon">{PhoneIcon}</span>
          {resident.phone || 'No phone on file'}
        </div>
        {(leaseText || resident.is_council_member || resident.vehicle_count > 0) && (
          <div className="resident-card-substatus">
            {resident.is_council_member && <span className="pill pill-approved">Council member</span>}
            {leaseText && <span>{leaseText}</span>}
            {resident.vehicle_count > 0 && (
              <span className="resident-card-meta-icon-inline">
                {CarIcon} {resident.vehicle_count} vehicle{resident.vehicle_count === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>
      <Link className="resident-card-action" to={linkTo}>{linkLabel} &rarr;</Link>
    </div>
  );
}
