const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { ok, fail } = require('./_lib/responses');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();

  const activeResidents = () =>
    supabase.from('residents').select('id', { count: 'exact', head: true }).eq('status', 'active');

  const [ownerRes, tenantRes, offsiteRes, pendingRes] = await Promise.all([
    activeResidents().eq('occupancy_type', 'owner'),
    activeResidents().eq('occupancy_type', 'tenant'),
    activeResidents().eq('occupancy_type', 'owner_offsite'),
    supabase
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const errored = [ownerRes, tenantRes, offsiteRes, pendingRes].find((r) => r.error);
  if (errored) {
    console.error('Dashboard query failed:', errored.error.message);
    return fail(res, 500, 'Failed to load dashboard analytics');
  }

  const owners = ownerRes.count || 0;
  const tenants = tenantRes.count || 0;
  const offsiteOwners = offsiteRes.count || 0;

  return ok(res, {
    // People who actually live in the society (owner-occupiers + tenants).
    // Off-site owners are landlords on record and are NOT counted here.
    residing: owners + tenants,
    owner_occupiers: owners,
    tenants,
    offsite_owners: offsiteOwners,
    // Everyone we hold a record for, residing or not.
    total_records: owners + tenants + offsiteOwners,
    pending_approvals: pendingRes.count || 0,
  });
};
