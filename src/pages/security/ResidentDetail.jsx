import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentPhoto from '../../components/ResidentPhoto';
import { api } from '../../lib/api';

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
      <Link to="/security/residents">&larr; Back to residents</Link>
      <h1>{resident.resident_name}</h1>
      <div className="card" style={{ display: 'flex', gap: 24, maxWidth: 560 }}>
        <ResidentPhoto path={resident.photo_path} alt={resident.resident_name} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <div><strong>Flat:</strong> {resident.flat_number}</div>
          <div><strong>Type:</strong> <span style={{ textTransform: 'capitalize' }}>{resident.occupancy_type}</span></div>
          <div><strong>Phone:</strong> {resident.phone}</div>
          <div><strong>Email:</strong> {resident.email || '—'}</div>
        </div>
      </div>
    </Layout>
  );
}
