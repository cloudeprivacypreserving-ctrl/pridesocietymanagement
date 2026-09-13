// Person names are stored uppercase across the app (residents, staff
// accounts) so a mix of "Rahul Sharma" / "rahul sharma" / "RAHUL SHARMA"
// never produces near-duplicate-looking entries or breaks exact-match
// lookups. Applied once, server-side, at every write path — not left to
// each caller to remember.
function toUpperName(raw) {
  if (raw == null) return raw;
  return String(raw).trim().replace(/\s+/g, ' ').toUpperCase();
}

module.exports = { toUpperName };
