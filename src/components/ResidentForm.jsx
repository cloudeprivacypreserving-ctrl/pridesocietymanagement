import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/api';
import { normalizeFlatNumber } from '../lib/flatNumber';
import { normalizePhone } from '../lib/phone';
import { compressImage } from '../lib/compressImage';

const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024; // reject absurdly large originals before even trying to compress

function splitFlatNumber(flatNumber) {
  const match = (flatNumber || '').match(/^([AB])-(\d+)$/);
  return match ? { tower: match[1], unit: match[2] } : { tower: 'A', unit: '' };
}

const UnitIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 21V9l9-6 9 6v12" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 21v-8h6v8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const UserIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
  </svg>
);
const PhoneIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MailIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 6l10 7 10-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const XCircleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" strokeLinecap="round" />
    <line x1="9" y1="9" x2="15" y2="15" strokeLinecap="round" />
  </svg>
);
const CheckCircleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MaleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="10" cy="14" r="6" />
    <line x1="14.5" y1="9.5" x2="20" y2="4" strokeLinecap="round" />
    <polyline points="15 4 20 4 20 9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const FemaleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="6" />
    <line x1="12" y1="14" x2="12" y2="22" strokeLinecap="round" />
    <line x1="9" y1="19" x2="15" y2="19" strokeLinecap="round" />
  </svg>
);
const HomeOffIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="14" y1="6" x2="21" y2="6" strokeLinecap="round" />
    <polyline points="18 3 21 6 18 9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function isLikelyValidPhone(raw) {
  try {
    normalizePhone(raw);
    return true;
  } catch {
    return false;
  }
}

export default function ResidentForm({ initial, onSubmit, submitLabel, showAdminFields = false }) {
  const initialFlat = splitFlatNumber(initial?.flat_number);
  const [tower, setTower] = useState(initialFlat.tower);
  const [unit, setUnit] = useState(initialFlat.unit);
  // The form shows Owner / Tenant. "Owner" plus the off-site toggle maps
  // to occupancy_type 'owner_offsite'; there is no separate button for it.
  const initialOccupancy = initial?.occupancy_type || 'owner';
  const [occupancyBase, setOccupancyBase] = useState(
    initialOccupancy === 'tenant' ? 'tenant' : 'owner'
  );
  const [ownerOffsite, setOwnerOffsite] = useState(initialOccupancy === 'owner_offsite');
  const occupancyType =
    occupancyBase === 'owner' ? (ownerOffsite ? 'owner_offsite' : 'owner') : 'tenant';
  const [residentName, setResidentName] = useState(initial?.resident_name || '');
  const [gender, setGender] = useState(initial?.gender || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [photoPath, setPhotoPath] = useState(initial?.photo_path || null);
  const [isCouncilMember, setIsCouncilMember] = useState(!!initial?.is_council_member);
  const [leaseExpiryDate, setLeaseExpiryDate] = useState(initial?.lease_expiry_date || '');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [photoFileName, setPhotoFileName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function uploadPhoto(file) {
    if (!file) return;
    setError('');

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG and PNG images are allowed');
      return;
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      setError('Photo must be 15 MB or smaller');
      return;
    }

    setUploading(true);
    try {
      let uploadFile = file;
      try {
        uploadFile = await compressImage(file);
      } catch {
        // Compression is a best-effort optimization — if it fails for any
        // reason (unsupported format quirk, etc.), fall back to the
        // original file rather than blocking the upload entirely.
      }

      if (uploadFile.size > MAX_BYTES) {
        setError('Photo is still too large after compression — try a different image');
        setUploading(false);
        return;
      }

      const { path, token } = await api.post('/photos/upload-url', {
        file_name: uploadFile.name,
        content_type: uploadFile.type,
        size_bytes: uploadFile.size,
      });

      const { error: uploadError } = await supabase.storage
        .from('resident-photos')
        .uploadToSignedUrl(path, token, uploadFile);

      if (uploadError) throw uploadError;
      setPhotoPath(path);
      setPhotoFileName(uploadFile.name);
    } catch (err) {
      setError(err.message || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handlePhotoChange(e) {
    uploadPhoto(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadPhoto(e.dataTransfer.files?.[0]);
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
        gender: gender || null,
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

  const unitNum = parseInt(unit, 10);
  const unitFloor = Math.floor(unitNum / 100);
  const unitPosition = unitNum % 100;
  const unitValid =
    unit === '' ||
    (unit.length >= 3 && unitFloor >= 1 && unitFloor <= 23 && unitPosition >= 1 && unitPosition <= 8);
  const phoneTouched = phone.length > 0;
  const phoneValid = !phoneTouched || isLikelyValidPhone(phone);

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <div className="form-row">
        <label htmlFor="unit">Assigned residence unit</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            id="tower"
            aria-label="Tower"
            value={tower}
            onChange={(e) => setTower(e.target.value)}
            style={{ flex: '0 0 100px' }}
          >
            <option value="A">Tower A</option>
            <option value="B">Tower B</option>
          </select>
          <div className="input-icon-wrap" style={{ flex: 1 }}>
            <span className="input-icon">{UnitIcon}</span>
            <input
              id="unit"
              inputMode="numeric"
              pattern="[0-9]*"
              value={unit}
              onChange={(e) => setUnit(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Unit 101"
              className={!unitValid ? 'input-invalid' : ''}
              required
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: unitValid ? 'var(--ink-dim)' : 'var(--danger)', marginTop: 4 }}>
          {unitValid
            ? 'Floors 1–23, units 01–08 per floor (e.g. 101–108, 2301–2308).'
            : 'Not a valid unit — floors 1–23 only have units 01–08.'}
        </div>
      </div>

      <div className="form-row">
        <label>Residency type</label>
        <div className="segmented segmented-full">
          <button
            type="button"
            className={occupancyBase === 'owner' ? 'active' : ''}
            onClick={() => setOccupancyBase('owner')}
          >
            <span className="segmented-icon">{UnitIcon}</span> Owner
          </button>
          <button
            type="button"
            className={occupancyBase === 'tenant' ? 'active' : ''}
            onClick={() => {
              setOccupancyBase('tenant');
              setOwnerOffsite(false);
            }}
          >
            <span className="segmented-icon">{UserIcon}</span> Tenant
          </button>
        </div>
        {occupancyBase === 'owner' && (
          <>
            <button
              type="button"
              className={`toggle-row${ownerOffsite ? ' is-on' : ''}`}
              onClick={() => setOwnerOffsite((v) => !v)}
              aria-pressed={ownerOffsite}
            >
              <span className="toggle-row-icon">{HomeOffIcon}</span>
              <span className="toggle-row-label">Owner does not live here (off-site landlord)</span>
              <span className="toggle-switch" aria-hidden="true" />
            </button>
            {ownerOffsite && (
              <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>
                Registered owner of this flat who doesn't currently live here — e.g. a landlord renting it out.
              </div>
            )}
          </>
        )}
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
        <label htmlFor="resident_name">Resident full name</label>
        <div className="input-icon-wrap">
          <span className="input-icon">{UserIcon}</span>
          <input id="resident_name" value={residentName} onChange={(e) => setResidentName(e.target.value)} required />
        </div>
      </div>

      <div className="form-row">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label>Gender</label>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Optional</span>
        </div>
        <div className="segmented segmented-full">
          <button
            type="button"
            className={gender === 'male' ? 'active' : ''}
            onClick={() => setGender(gender === 'male' ? '' : 'male')}
          >
            <span className="segmented-icon">{MaleIcon}</span> Male
          </button>
          <button
            type="button"
            className={gender === 'female' ? 'active' : ''}
            onClick={() => setGender(gender === 'female' ? '' : 'female')}
          >
            <span className="segmented-icon">{FemaleIcon}</span> Female
          </button>
        </div>
        {!gender && (
          <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>
            Not specified — tap again to clear a selection.
          </div>
        )}
      </div>

      <div className="form-row">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label htmlFor="phone">Mobile phone</label>
          {!phoneValid && <span className="field-flag field-flag-danger">{XCircleIcon} Invalid entry</span>}
          {phoneTouched && phoneValid && <span className="field-flag field-flag-ok">{CheckCircleIcon} Valid</span>}
        </div>
        <div className={`input-icon-wrap${!phoneValid ? ' input-icon-wrap-invalid' : ''}`}>
          <span className="input-icon">{PhoneIcon}</span>
          <input
            id="phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
            placeholder="9876543210"
            maxLength={13}
            className={!phoneValid ? 'input-invalid' : ''}
            required
          />
        </div>
        {!phoneValid ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
            Enter a valid 10-digit Indian mobile number
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 4 }}>
            10-digit mobile number, optionally prefixed with +91.
          </div>
        )}
      </div>

      <div className="form-row">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <label htmlFor="email">Email address</label>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Optional</span>
        </div>
        <div className="input-icon-wrap">
          <span className="input-icon">{MailIcon}</span>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="resident@example.com" />
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="photo">Resident photo</label>
        <label
          htmlFor="photo"
          className={`dropzone${dragOver ? ' dropzone-active' : ''}${photoPath ? ' dropzone-filled' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input id="photo" type="file" accept="image/jpeg,image/png" onChange={handlePhotoChange} hidden />
          {uploading ? (
            <span className="dropzone-text">Uploading...</span>
          ) : photoPath ? (
            <span className="dropzone-text">
              <span className="dropzone-check">&#10003;</span> {photoFileName || 'Photo attached'}
            </span>
          ) : (
            <span className="dropzone-text">
              Click or drag a photo here<br />
              <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>JPEG or PNG, up to 3 MB</span>
            </span>
          )}
        </label>
      </div>

      {error && <div className="error-text">{error}</div>}

      <button className="btn btn-primary" type="submit" disabled={submitting || uploading}>
        {submitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
