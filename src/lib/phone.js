// Mirrors api/_lib/phone.js — kept in sync manually since the API and
// frontend don't share a build step.
export function normalizePhone(raw) {
  let digits = (raw || '').trim().replace(/[\s-]/g, '');

  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  if (!/^\d{10}$/.test(digits)) {
    throw new Error('Phone number must be 10 digits (optionally prefixed with +91)');
  }

  return digits;
}
