import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentPhoto from '../../components/ResidentPhoto';
import ResidentForm from '../../components/ResidentForm';
import VehiclesSection from '../../components/VehiclesSection';
import { api } from '../../lib/api';

export default function ResidentDetail() {
  const { id } = useParams();
  const [resident, setResident] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function load() {
    api.get(`/residents/${id}`).then(setResident).catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  async function handleUpdate(payload) {
    const updated = await api.patch(`/residents/${id}`, payload);
    setResident(updated);
    setEditing(false);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete resident ${resident.resident_name} (flat ${resident.flat_number})? This cannot be undone.`)) {
      return;
    }
    await api.delete(`/residents/${id}`);
    navigate('/admin/residents');
  }

  if (error) return <Layout><div className="error-text">{error}</div></Layout>;
  if (!resident) return <Layout><div>Loading...</div></Layout>;

  return (
    <Layout>
      <Link to="/admin/residents">&larr; Back to residents</Link>

      {editing ? (
        <>
          <h1>Edit resident</h1>
          <ResidentForm initial={resident} onSubmit={handleUpdate} submitLabel="Save changes" showAdminFields />
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          <div className="top-bar">
            <h1 style={{ margin: 0 }}>
              {resident.resident_name}
              {resident.is_council_member && (
                <span className="pill pill-approved" style={{ marginLeft: 10, verticalAlign: 'middle' }}>Council member</span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setEditing(true)}>Edit</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', gap: 24, maxWidth: 560 }}>
            <ResidentPhoto path={resident.photo_path} alt={resident.resident_name} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <div><strong>Flat:</strong> {resident.flat_number}</div>
              <div><strong>Type:</strong> <span style={{ textTransform: 'capitalize' }}>{resident.occupancy_type}</span></div>
              <div><strong>Phone:</strong> {resident.phone}</div>
              <div><strong>Email:</strong> {resident.email || '—'}</div>
              {resident.occupancy_type === 'tenant' && (
                <div><strong>Lease expiry:</strong> {resident.lease_expiry_date || '—'}</div>
              )}
              <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginTop: 8 }}>
                Added {new Date(resident.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          <VehiclesSection residentId={resident.id} />
        </>
      )}
    </Layout>
  );
}
