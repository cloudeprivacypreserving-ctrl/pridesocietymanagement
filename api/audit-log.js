const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { ok, fail } = require('./_lib/responses');

const PAGE_SIZE = 50;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, target_table, target_id, details, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Fetch audit log failed:', error.message);
    return fail(res, 500, 'Failed to fetch audit log');
  }

  return ok(res, { entries: data, page, page_size: PAGE_SIZE, total: count || 0 });
};
