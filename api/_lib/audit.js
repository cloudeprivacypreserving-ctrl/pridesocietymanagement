const { getSupabaseAdmin } = require('./supabaseAdmin');

// Extracts client IP + coarse geolocation from the request. Vercel adds
// x-vercel-ip-* headers automatically on every request in production (no
// paid geolocation API, no user permission needed) — this is ISP/city
// level, not GPS-precise, but enough to notice "this admin action came
// from an unexpected country." Local dev has none of these headers, so
// everything comes back null there.
function requestOrigin(req) {
  if (!req || !req.headers) return {};
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '')
    .split(',')[0]
    .trim();
  return {
    ip_address: ip || null,
    city: req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : null,
    region: req.headers['x-vercel-ip-country-region'] || null,
    country: req.headers['x-vercel-ip-country'] || null,
  };
}

/**
 * Writes an audit_log row. Never pass tokens, passwords, or other secrets
 * in `details` — it is stored as-is in jsonb.
 *
 * Pass `req` (the incoming request) whenever it's available so the row
 * captures the actor's IP/location — every call site should have it since
 * this always runs inside an API handler.
 */
async function writeAuditLog({ actorId, action, targetTable = null, targetId = null, details = null, req = null }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    details,
    ...requestOrigin(req),
  });

  if (error) {
    // Audit logging failures must not break the primary action, but should
    // be visible in server logs for investigation.
    console.error('Failed to write audit log:', error.message);
  }
}

module.exports = { writeAuditLog };
