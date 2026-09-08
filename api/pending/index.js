const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { requireRole } = require('../_lib/auth');
const { writeAuditLog } = require('../_lib/audit');
const { ok, fail } = require('../_lib/responses');
const { normalizeFlatNumber } = require('../_lib/flatNumber');
const { normalizePhone } = require('../_lib/phone');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleSubmit(req, res);
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { status } = req.query;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('pending_approvals')
    .select('*')
    .order('created_at', { ascending: false });

  if (auth.profile.role === 'security') {
    query = query.eq('submitted_by', auth.profile.id);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('List pending approvals failed:', error.message);
    return fail(res, 500, 'Failed to fetch pending approvals');
  }

  return ok(res, data);
}

async function handleSubmit(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { flat_number, occupancy_type, resident_name, phone, email, photo_path } = req.body || {};

  if (!flat_number || !occupancy_type || !resident_name || !phone) {
    return fail(res, 400, 'flat_number, occupancy_type, resident_name, and phone are required');
  }
  if (!['owner', 'tenant'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner or tenant', 'occupancy_type');
  }

  let normalizedFlat;
  try {
    normalizedFlat = normalizeFlatNumber(flat_number);
  } catch (err) {
    return fail(res, 400, err.message, 'flat_number');
  }

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhone(phone);
  } catch (err) {
    return fail(res, 400, err.message, 'phone');
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('pending_approvals')
    .insert({
      flat_number: normalizedFlat,
      occupancy_type,
      resident_name,
      phone: normalizedPhone,
      email: email || null,
      photo_path: photo_path || null,
      submitted_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Submit pending approval failed:', error.message);
    return fail(res, 500, 'Failed to submit resident');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_submitted',
    targetTable: 'pending_approvals',
    targetId: data.id,
    details: { flat_number: normalizedFlat, occupancy_type },
  });

  return ok(res, data, 201);
}
