// Mirrors api/_lib/flatNumber.js — kept in sync manually since the API and
// frontend don't share a build step. Canonical format: A-101 to B-2308.
// Unit encodes floor + position: floors 1-23, positions 01-08 per floor.
const FLAT_NUMBER_PATTERN = /^([AB])-?(\d{3,4})$/i;
const MIN_FLOOR = 1;
const MAX_FLOOR = 23;
const MIN_POSITION = 1;
const MAX_POSITION = 8;

export function normalizeFlatNumber(raw) {
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
