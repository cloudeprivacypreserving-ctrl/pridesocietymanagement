import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentPhoto from '../../components/ResidentPhoto';
import VehiclesSection from '../../components/VehiclesSection';
import { api } from '../../lib/api';
import { ArrowLeft, Home, Phone, Mail, Calendar } from '../../components/icons';

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
            <span className="pill pill-approved" style={{ marginLeft: 20 }}>{resident.occupancy_type}</span>
          </div>
          <div className="detail-row"><span className="detail-icon">{Phone}</span> {resident.phone}</div>
          <div className="detail-row"><span className="detail-icon">{Mail}</span> {resident.email || '—'}</div>
          {resident.occupancy_type === 'tenant' && (
            <div className="detail-row"><span className="detail-icon">{Calendar}</span> Lease expiry: {resident.lease_expiry_date || '—'}</div>
          )}
        </div>
      </div>

      <VehiclesSection residentId={resident.id} />
    </Layout>
  );
}
