// Canonical flat number format: <Tower><-><Unit>, e.g. A-101, B-2307.
// Tower is A or B. Unit is 101-2307 (floor + unit encoded together).
const FLAT_NUMBER_PATTERN = /^([AB])-?(\d{3,4})$/i;
const MIN_UNIT = 101;
const MAX_UNIT = 2307;

/**
 * Normalizes and validates a flat number string. Returns the canonical
 * form (e.g. "A-101") on success, or throws with a user-facing message.
 */
function normalizeFlatNumber(raw) {
  const trimmed = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = trimmed.match(FLAT_NUMBER_PATTERN);

  if (!match) {
    throw new Error('Flat number must be in the format A-101 or B-2307 (tower A or B, then a 3-4 digit unit number)');
  }

  const [, tower, unitStr] = match;
  const unit = parseInt(unitStr, 10);

  if (unit < MIN_UNIT || unit > MAX_UNIT) {
    throw new Error(`Unit number must be between ${MIN_UNIT} and ${MAX_UNIT}`);
  }

  return `${tower}-${unitStr}`;
}

module.exports = { normalizeFlatNumber };
