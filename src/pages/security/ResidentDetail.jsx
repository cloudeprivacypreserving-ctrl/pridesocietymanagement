import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentPhoto from '../../components/ResidentPhoto';
import VehiclesSection from '../../components/VehiclesSection';
import { api } from '../../lib/api';
import { ArrowLeft, Home, Phone, Mail, Calendar, UserPlus, User } from '../../components/icons';
import { occupancyLabel, flatMissingOwner, genderLabel } from '../../lib/occupancy';

export default function ResidentDetail() {
  const { id } = useParams();
  const [resident, setResident] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/residents/${id}`).then(setResident).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <Layout><div className="error-text">{error}</div></Layout>;
  if (!resident) return <Layout><div>Loading...</div></Layout>;

  return (
    <Layout>
      <Link to="/security/residents" className="back-link">
        <span className="back-link-icon">{ArrowLeft}</span> Back to residents
      </Link>
      <h1>
        {resident.resident_name}
        {resident.is_council_member && (
          <span className="pill pill-approved" style={{ marginLeft: 10, verticalAlign: 'middle' }}>Council member</span>
        )}
      </h1>
      <div className="card" style={{ display: 'flex', gap: 24, maxWidth: 560 }}>
        <ResidentPhoto path={resident.photo_path} alt={resident.resident_name} />
        <div className="detail-list">
          <div className="detail-row"><span className="detail-icon">{Home}</span> {resident.flat_number}</div>
          <div className="detail-row">
            <span className="pill pill-approved" style={{ marginLeft: 20 }}>{occupancyLabel(resident.occupancy_type)}</span>
          </div>
          <div className="detail-row"><span className="detail-icon">{Phone}</span> {resident.phone}</div>
          <div className="detail-row"><span className="detail-icon">{Mail}</span> {resident.email || '—'}</div>
          {genderLabel(resident.gender) && (
            <div className="detail-row"><span className="detail-icon">{User}</span> {genderLabel(resident.gender)}</div>
          )}
          {resident.occupancy_type === 'tenant' && (
            <div className="detail-row"><span className="detail-icon">{Calendar}</span> Lease expiry: {resident.lease_expiry_date || '—'}</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="top-bar" style={{ marginBottom: resident.flatmates.length > 0 ? 14 : 0 }}>
          <h2 style={{ margin: 0 }}>Others at {resident.flat_number}</h2>
          <Link className="btn btn-primary" to={`/security/new?flat=${encodeURIComponent(resident.flat_number)}`}>
            <span className="btn-icon">{UserPlus}</span> Add family member
          </Link>
        </div>
        {flatMissingOwner([resident, ...resident.flatmates]) && (
          <div className="pill pill-pending" style={{ marginBottom: 10, display: 'inline-block' }}>
            No owner on file for this flat
          </div>
        )}
        {resident.flatmates.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', fontSize: 13.5 }}>No other residents recorded at this flat.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resident.flatmates.map((mate) => (
              <Link
                key={mate.id}
                to={`/security/residents/${mate.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13.5,
                  color: 'var(--ink)',
                }}
              >
                <span>
                  <strong>{mate.resident_name}</strong>{' '}
                  <span className="pill pill-approved" style={{ marginLeft: 4 }}>{occupancyLabel(mate.occupancy_type)}</span>
                </span>
                <span style={{ color: 'var(--ink-dim)' }}>{mate.phone}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <VehiclesSection flatNumber={resident.flat_number} />
    </Layout>
  );
}
