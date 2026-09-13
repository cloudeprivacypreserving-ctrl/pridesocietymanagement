const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');

const PAGE_SIZE = 50;

// GET  /api/audit-log            — paginated list, newest first
// DELETE /api/audit-log { before } or { from, to } — purge rows in a date
//   range (admin-only). `before` deletes everything older than that date
//   (e.g. the "older than 30 days" quick action); `from`/`to` deletes a
//   specific window. Dates are inclusive, interpreted as calendar days.
module.exports = async function handler(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res, auth);
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from('audit_log')
    .select(
      'id, actor_id, action, target_table, target_id, details, ip_address, city, region, country, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Fetch audit log failed:', error.message);
    return fail(res, 500, 'Failed to fetch audit log');
  }

  return ok(res, { entries: data, page, page_size: PAGE_SIZE, total: count || 0 });
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
}

async function handleDelete(req, res, auth) {
  const { before, from, to } = req.body || {};
  const supabase = getSupabaseAdmin();

  let query = supabase.from('audit_log').delete({ count: 'exact' });
  let rangeDescription;

  if (before) {
    if (!isValidDate(before)) {
      return fail(res, 400, 'before must be a YYYY-MM-DD date', 'before');
    }
    query = query.lt('created_at', before);
    rangeDescription = { before };
  } else if (from || to) {
    if (from && !isValidDate(from)) return fail(res, 400, 'from must be a YYYY-MM-DD date', 'from');
    if (to && !isValidDate(to)) return fail(res, 400, 'to must be a YYYY-MM-DD date', 'to');
    if (from) query = query.gte('created_at', from);
    if (to) {
      // "to" is inclusive of the whole day, so delete up to (not
      // including) the next calendar day.
      const toExclusive = new Date(to);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
      query = query.lt('created_at', toExclusive.toISOString().slice(0, 10));
    }
    rangeDescription = { from: from || null, to: to || null };
  } else {
    return fail(res, 400, 'Provide either "before" or a "from"/"to" range');
  }

  const { error, count } = await query;

  if (error) {
    console.error('Delete audit log failed:', error.message);
    return fail(res, 500, 'Failed to delete audit log entries');
  }

  // Log the purge itself — deliberately after the delete, so it's the
  // first entry in whatever remains, and never one of the rows just
  // removed even if the range happened to include "now".
  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'audit_log_purged',
    targetTable: 'audit_log',
    details: { ...rangeDescription, deleted_count: count || 0 },
  });

  return ok(res, { deleted_count: count || 0 });
}
