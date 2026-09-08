const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { requireRole } = require('../_lib/auth');
const { writeAuditLog } = require('../_lib/audit');
const { ok, fail } = require('../_lib/responses');

module.exports = async function handler(req, res) {
  const { id } = req.query;
  if (!id) return fail(res, 400, 'Missing vehicle id');

  if (req.method !== 'DELETE') return fail(res, 405, 'Method not allowed');

  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('vehicles').delete().eq('id', id).select().single();

  if (error || !data) {
    return fail(res, 404, 'Vehicle not found');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'vehicle_removed',
    targetTable: 'vehicles',
    targetId: id,
    details: { resident_id: data.resident_id, plate_number: data.plate_number },
  });

  return ok(res, { id });
};
