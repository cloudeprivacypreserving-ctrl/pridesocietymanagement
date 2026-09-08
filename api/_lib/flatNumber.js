// Canonical flat number format: <Tower><-><Unit>, e.g. A-101, B-2308.
// Tower is A or B. Unit encodes floor + position: floors 1-23, positions
// 01-08 per floor (e.g. 101..108, 201..208, ... 2301..2308).
const FLAT_NUMBER_PATTERN = /^([AB])-?(\d{3,4})$/i;
const MIN_FLOOR = 1;
const MAX_FLOOR = 23;
const MIN_POSITION = 1;
const MAX_POSITION = 8;

/**
 * Normalizes and validates a flat number string. Returns the canonical
 * form (e.g. "A-101") on success, or throws with a user-facing message.
 */
function normalizeFlatNumber(raw) {
  const trimmed = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = trimmed.match(FLAT_NUMBER_PATTERN);

  if (!match) {
    throw new Error('Flat number must be in the format A-101 or B-2308 (tower A or B, then a 3-4 digit unit number)');
  }

  const [, tower, unitStr] = match;
  const unit = parseInt(unitStr, 10);
  const floor = Math.floor(unit / 100);
  const position = unit % 100;

  if (floor < MIN_FLOOR || floor > MAX_FLOOR || position < MIN_POSITION || position > MAX_POSITION) {
    throw new Error(
      `${tower}-${unitStr} is not a valid flat. Each floor (1-${MAX_FLOOR}) has units 01-0${MAX_POSITION}, e.g. ${tower}-101 to ${tower}-108.`
    );
  }

  return `${tower}-${unitStr}`;
}

module.exports = { normalizeFlatNumber };
