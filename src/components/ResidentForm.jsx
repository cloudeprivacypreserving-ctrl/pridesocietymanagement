import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/api';
import { normalizeFlatNumber } from '../lib/flatNumber';

const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 3 * 1024 * 1024;

export default function ResidentForm({ initial, onSubmit, submitLabel }) {
  const [flatNumber, setFlatNumber] = useState(initial?.flat_number || '');
  const [occupancyType, setOccupancyType] = useState(initial?.occupancy_type || 'owner');
  const [residentName, setResidentName] = useState(initial?.resident_name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [photoPath, setPhotoPath] = useState(initial?.photo_path || null);
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

    if (!flatNumber.trim() || !residentName.trim() || !phone.trim()) {
      setError('Flat number, resident name, and phone are required');
      return;
    }

    let normalizedFlat;
    try {
      normalizedFlat = normalizeFlatNumber(flatNumber);
    } catch (err) {
      setError(err.message);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        flat_number: normalizedFlat,
        occupancy_type: occupancyType,
        resident_name: residentName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        photo_path: photoPath,
      });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <div className="form-row">
        <label htmlFor="flat_number">Flat number</label>
        <input
          id="flat_number"
          value={flatNumber}
          onChange={(e) => setFlatNumber(e.target.value)}
          placeholder="A-101"
          required
        />
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 4 }}>
          Tower A or B, then unit number (101–2307). E.g. A-101, B-2307.
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="occupancy_type">Owner or tenant</label>
        <select id="occupancy_type" value={occupancyType} onChange={(e) => setOccupancyType(e.target.value)}>
          <option value="owner">Owner</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="resident_name">Resident name</label>
        <input id="resident_name" value={residentName} onChange={(e) => setResidentName(e.target.value)} required />
      </div>

      <div className="form-row">
        <label htmlFor="phone">Phone number</label>
        <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
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
