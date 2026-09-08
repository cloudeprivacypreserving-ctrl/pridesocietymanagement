import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/api';
import { normalizeFlatNumber } from '../lib/flatNumber';
import { normalizePhone } from '../lib/phone';

const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 3 * 1024 * 1024;

function splitFlatNumber(flatNumber) {
  const match = (flatNumber || '').match(/^([AB])-(\d+)$/);
  return match ? { tower: match[1], unit: match[2] } : { tower: 'A', unit: '' };
}

export default function ResidentForm({ initial, onSubmit, submitLabel, showAdminFields = false }) {
  const initialFlat = splitFlatNumber(initial?.flat_number);
  const [tower, setTower] = useState(initialFlat.tower);
  const [unit, setUnit] = useState(initialFlat.unit);
  const [occupancyType, setOccupancyType] = useState(initial?.occupancy_type || 'owner');
  const [residentName, setResidentName] = useState(initial?.resident_name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [photoPath, setPhotoPath] = useState(initial?.photo_path || null);
  const [isCouncilMember, setIsCouncilMember] = useState(!!initial?.is_council_member);
  const [leaseExpiryDate, setLeaseExpiryDate] = useState(initial?.lease_expiry_date || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG and PNG images are allowed');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Photo must be 3 MB or smaller');
      return;
    }

    setUploading(true);
    try {
      const { path, signed_url, token } = await api.post('/photos/upload-url', {
        file_name: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });

      const { error: uploadError } = await supabase.storage
        .from('resident-photos')
        .uploadToSignedUrl(path, token, file);

      if (uploadError) throw uploadError;
      setPhotoPath(path);
    } catch (err) {
      setError(err.message || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!unit.trim() || !residentName.trim() || !phone.trim()) {
      setError('Flat number, resident name, and phone are required');
      return;
    }

    let normalizedFlat;
    try {
      normalizedFlat = normalizeFlatNumber(`${tower}-${unit.trim()}`);
    } catch (err) {
      setError(err.message);
      return;
    }

    let normalizedPhone;
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (err) {
      setError(err.message);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        flat_number: normalizedFlat,
        occupancy_type: occupancyType,
        resident_name: residentName.trim(),
        phone: normalizedPhone,
        email: email.trim() || null,
        photo_path: photoPath,
      };
      if (showAdminFields) {
        payload.is_council_member = isCouncilMember;
        payload.lease_expiry_date = occupancyType === 'tenant' ? leaseExpiryDate || null : null;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <div className="form-row">
        <label htmlFor="unit">Flat number</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            id="tower"
            aria-label="Tower"
            value={tower}
            onChange={(e) => setTower(e.target.value)}
            style={{ flex: '0 0 80px' }}
          >
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <input
            id="unit"
            inputMode="numeric"
            pattern="[0-9]*"
            value={unit}
            onChange={(e) => setUnit(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="101"
            required
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 4 }}>
          Unit number between 101 and 2307.
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="occupancy_type">Owner or tenant</label>
        <select id="occupancy_type" value={occupancyType} onChange={(e) => setOccupancyType(e.target.value)}>
          <option value="owner">Owner</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>

      {showAdminFields && occupancyType === 'tenant' && (
        <div className="form-row">
          <label htmlFor="lease_expiry">Lease expiry date</label>
          <input
            id="lease_expiry"
            type="date"
            value={leaseExpiryDate}
            onChange={(e) => setLeaseExpiryDate(e.target.value)}
          />
        </div>
      )}

      {showAdminFields && (
        <div className="form-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={isCouncilMember}
              onChange={(e) => setIsCouncilMember(e.target.checked)}
            />
            Council member
          </label>
        </div>
      )}

      <div className="form-row">
        <label htmlFor="resident_name">Resident name</label>
        <input id="resident_name" value={residentName} onChange={(e) => setResidentName(e.target.value)} required />
      </div>

      <div className="form-row">
        <label htmlFor="phone">Phone number</label>
        <input
          id="phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
          placeholder="9876543210"
          maxLength={13}
          required
        />
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 4 }}>
          10-digit mobile number, optionally prefixed with +91.
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="form-row">
        <label htmlFor="photo">Resident photo</label>
        <input id="photo" type="file" accept="image/jpeg,image/png" onChange={handlePhotoChange} />
        {uploading && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 6 }}>Uploading...</div>}
        {photoPath && !uploading && <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 6 }}>Photo attached</div>}
      </div>

      {error && <div className="error-text">{error}</div>}

      <button className="btn btn-primary" type="submit" disabled={submitting || uploading}>
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
