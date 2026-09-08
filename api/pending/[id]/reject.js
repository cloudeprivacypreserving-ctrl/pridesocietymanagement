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

  const { reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return fail(res, 400, 'A rejection reason is required', 'reason');
  }

  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await supabase
    .from('pending_approvals')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return fail(res, 404, 'Pending submission not found');
  }
  if (existing.status !== 'pending') {
    return fail(res, 409, 'This submission has already been reviewed');
  }

  const { data, error } = await supabase
    .from('pending_approvals')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: auth.profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !data) {
    console.error('Reject pending submission failed:', error?.message);
    return fail(res, 409, 'This submission has already been reviewed');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_rejected',
    targetTable: 'pending_approvals',
    targetId: id,
    details: { reason },
  });

  return ok(res, data);
};
