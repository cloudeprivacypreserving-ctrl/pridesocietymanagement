// Indian vehicle registration plate validation. Accepts two formats:
//   Standard state-series: XX-00-XX-0000  e.g. MH-02-DF-9182, DL-01-AB-1234
//     (2 letters state code, 1-2 digit RTO code, 1-2 letter series, 4 digit number)
//   BH-series (Bharat series):            e.g. 21-BH-1234-AB
//     (2 digit year, "BH", 4 digit number, 1-2 letter series)
const STANDARD_PATTERN = /^([A-Z]{2})(\d{1,2})([A-Z]{1,2})(\d{4})$/;
const BH_PATTERN = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/;

function normalizeVehiclePlate(raw) {
  const cleaned = (raw || '').trim().toUpperCase().replace(/[\s.-]+/g, '');

  const standardMatch = cleaned.match(STANDARD_PATTERN);
  if (standardMatch) {
    const [, state, rto, series, number] = standardMatch;
    return `${state}-${rto.padStart(2, '0')}-${series}-${number}`;
  }

  const bhMatch = cleaned.match(BH_PATTERN);
  if (bhMatch) {
    const [, year, number, series] = bhMatch;
    return `${year}-BH-${number}-${series}`;
  }

  throw new Error('Enter a valid vehicle number, e.g. MH-02-DF-9182 or 21-BH-1234-AB');
}

module.exports = { normalizeVehiclePlate };
