// Indian mobile numbers: exactly 10 digits, with an optional +91/91/0 prefix
// stripped before validation. Stored in the canonical 10-digit form.
function normalizePhone(raw) {
  let digits = (raw || '').trim().replace(/[\s-]/g, '');

  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  if (!/^\d{10}$/.test(digits)) {
    throw new Error('Phone number must be 10 digits (optionally prefixed with +91)');
  }

  return digits;
}

module.exports = { normalizePhone };
