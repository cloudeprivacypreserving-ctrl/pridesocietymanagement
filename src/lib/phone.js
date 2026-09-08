// Lightweight client-side check, used only for live form UX (red/green
// field state). The real validation lives server-side in
// api/_lib/phone.js using libphonenumber-js — that's the source of
// truth, and this is deliberately not a full mirror of it, to avoid
// shipping libphonenumber's metadata to the browser for a cosmetic hint.
// Same shape as the previous plain regex, plus an Indian-mobile-prefix
// check (6-9) so obviously-wrong numbers don't show as valid.
export function normalizePhone(raw) {
  let digits = (raw || '').trim().replace(/[\s-]/g, '');

  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error('Enter a valid 10-digit Indian mobile number');
  }

  return digits;
}
