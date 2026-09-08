const { getSupabaseAdmin } = require('../../_lib/supabaseAdmin');
const { requireRole } = require('../../_lib/auth');
const { writeAuditLog } = require('../../_lib/audit');
const { ok, fail } = require('../../_lib/responses');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { id } = req.query;
  if (!id) return fail(res, 400, 'Missing pending approval id');

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('approve_pending_submission', {
    p_pending_id: id,
    p_reviewer_id: auth.profile.id,
  });

  if (error) {
    if (error.code === 'P0002') {
      return fail(res, 404, 'Pending submission not found');
    }
    if (error.code === 'P0001') {
      return fail(res, 409, 'This submission has already been reviewed');
    }
    if (error.code === '23505') {
      return fail(res, 409, 'A resident with this flat number already exists');
    }
    console.error('Approve pending submission failed:', error.message);
    return fail(res, 500, 'Failed to approve submission');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_approved',
    targetTable: 'residents',
    targetId: data.id,
    details: { pending_id: id, flat_number: data.flat_number },
  });

  return ok(res, data);
};
