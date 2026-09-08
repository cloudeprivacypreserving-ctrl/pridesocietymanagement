// Use the "mobile" metadata build — the default/min build omits per-number-
// type data (mobile vs. landline), which silently makes getType() return
// undefined and fails every check that relies on it. The "mobile" build
// carries just enough type metadata to distinguish mobile numbers without
// the full "max" build's country-format bloat.
const { parsePhoneNumberFromString } = require('libphonenumber-js/mobile');

// Validates Indian mobile numbers using libphonenumber (Google's own phone
// number library) rather than a plain digit-count regex — this catches
// numbers that are the right length but not a real assigned Indian mobile
// prefix, not just malformed input. Stored in the canonical 10-digit form
// (no country code) to match the existing schema/UI.
function normalizePhone(raw) {
  const input = (raw || '').trim();
  if (!input) {
    throw new Error('Phone number is required');
  }

  // Numbers are entered without a country code in the UI, so parse them
  // as Indian by default; a leading +91/91/0 in the input is handled by
  // libphonenumber's own parsing.
  const phone = parsePhoneNumberFromString(input, 'IN');

  if (!phone || !phone.isValid() || phone.country !== 'IN' || phone.getType() !== 'MOBILE') {
    throw new Error('Enter a valid 10-digit Indian mobile number');
  }

  return phone.nationalNumber; // 10 digits, no country code
}

module.exports = { normalizePhone };
