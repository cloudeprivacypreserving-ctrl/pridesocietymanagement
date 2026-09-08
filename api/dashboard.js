const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { ok, fail } = require('./_lib/responses');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();

  const [totalRes, ownersRes, tenantsRes, pendingRes] = await Promise.all([
    supabase.from('residents').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('occupancy_type', 'owner'),
    supabase
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('occupancy_type', 'tenant'),
    supabase
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const errored = [totalRes, ownersRes, tenantsRes, pendingRes].find((r) => r.error);
  if (errored) {
    console.error('Dashboard query failed:', errored.error.message);
    return fail(res, 500, 'Failed to load dashboard analytics');
  }

  return ok(res, {
    total_residents: totalRes.count || 0,
    total_owners: ownersRes.count || 0,
    total_tenants: tenantsRes.count || 0,
    pending_approvals: pendingRes.count || 0,
  });
};
