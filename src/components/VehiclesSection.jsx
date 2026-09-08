import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Car, Trash } from './icons';

export default function VehiclesSection({ residentId }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    api
      .get(`/vehicles?resident_id=${residentId}`)
      .then(setVehicles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [residentId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!plateNumber.trim()) return;
    setError('');
    setAdding(true);
    try {
      await api.post('/vehicles', { resident_id: residentId, plate_number: plateNumber.trim(), vehicle_type: vehicleType.trim() || null });
      setPlateNumber('');
      setVehicleType('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id) {
    setError('');
    try {
      await api.delete(`/vehicles/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="detail-icon" style={{ color: 'var(--accent)' }}>{Car}</span> Vehicles
      </h2>
      {error && <div className="error-text">{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--ink-dim)', fontSize: 13.5 }}>Loading...</div>
      ) : vehicles.length === 0 ? (
        <div style={{ color: 'var(--ink-dim)', fontSize: 13.5, marginBottom: 14 }}>No vehicles on record.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13.5,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="detail-icon">{Car}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{v.plate_number}</span>
                {v.vehicle_type && <span style={{ color: 'var(--ink-dim)' }}> · {v.vehicle_type}</span>}
              </span>
              <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => handleRemove(v.id)}>
                <span className="btn-icon">{Trash}</span> Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Plate number (e.g. MH-02-DF-9182)"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <input
          placeholder="Type (optional)"
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          style={{ maxWidth: 140 }}
        />
        <button className="btn btn-primary" type="submit" disabled={adding || !plateNumber.trim()}>
          {adding ? 'Adding...' : 'Add vehicle'}
        </button>
      </form>
    </div>
  );
}
