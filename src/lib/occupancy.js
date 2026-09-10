// Shared display helpers for the three occupancy_type values. An
// off-site owner is a full resident record (name/phone/photo like any
// other) flagged as the flat's registered owner without living there —
// e.g. a landlord who rents the flat out to tenants.
export const OCCUPANCY_LABELS = {
  owner: 'Owner',
  tenant: 'Tenant',
  owner_offsite: 'Owner (off-site)',
};

export function occupancyLabel(type) {
  return OCCUPANCY_LABELS[type] || type;
}

export function isOwnerType(type) {
  return type === 'owner' || type === 'owner_offsite';
}

export const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

export function genderLabel(g) {
  return GENDER_LABELS[g] || null;
}

// True when a flat's resident list has tenants but no owner-of-record
// (onsite or offsite) at all — a gap worth flagging in the UI.
export function flatMissingOwner(residents) {
  const hasTenant = residents.some((r) => r.occupancy_type === 'tenant');
  const hasOwner = residents.some((r) => isOwnerType(r.occupancy_type));
  return hasTenant && !hasOwner;
}
