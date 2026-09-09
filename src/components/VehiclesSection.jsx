import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { normalizeVehiclePlate } from '../lib/vehiclePlate';
import { Car, Trash } from './icons';

const BikeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const VEHICLE_TYPE_LABEL = { two_wheeler: 'Two-wheeler', four_wheeler: 'Four-wheeler' };
const VEHICLE_TYPE_ICON = { two_wheeler: BikeIcon, four_wheeler: Car };

export default function VehiclesSection({ flatNumber }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('four_wheeler');
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    api
      .get(`/vehicles?flat_number=${encodeURIComponent(flatNumber)}`)
      .then(setVehicles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [flatNumber]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!plateNumber.trim()) return;
    setError('');

    let normalizedPlate;
    try {
      normalizedPlate = normalizeVehiclePlate(plateNumber);
    } catch (err) {
      setError(err.message);
      return;
    }

    setAdding(true);
    try {
      await api.post('/vehicles', { flat_number: flatNumber, plate_number: normalizedPlate, vehicle_type: vehicleType });
      setPlateNumber('');
      setVehicleType('four_wheeler');
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
        <span className="detail-icon" style={{ color: 'var(--accent)' }}>{Car}</span> Household vehicles
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
                <span className="detail-icon">{VEHICLE_TYPE_ICON[v.vehicle_type] || Car}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{v.plate_number}</span>
                {v.vehicle_type && <span style={{ color: 'var(--ink-dim)' }}> · {VEHICLE_TYPE_LABEL[v.vehicle_type] || v.vehicle_type}</span>}
              </span>
              <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => handleRemove(v.id)}>
                <span className="btn-icon">{Trash}</span> Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="MH-02-DF-9182 or 21-BH-1234-AB"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={adding || !plateNumber.trim()} style={{ flexShrink: 0 }}>
            {adding ? 'Adding...' : 'Add vehicle'}
          </button>
        </div>
        <div className="segmented segmented-full" style={{ maxWidth: 320 }}>
          <button
            type="button"
            className={vehicleType === 'two_wheeler' ? 'active' : ''}
            onClick={() => setVehicleType('two_wheeler')}
          >
            <span className="segmented-icon">{BikeIcon}</span> Two-wheeler
          </button>
          <button
            type="button"
            className={vehicleType === 'four_wheeler' ? 'active' : ''}
            onClick={() => setVehicleType('four_wheeler')}
          >
            <span className="segmented-icon">{Car}</span> Four-wheeler
          </button>
        </div>
      </form>
    </div>
  );
}
