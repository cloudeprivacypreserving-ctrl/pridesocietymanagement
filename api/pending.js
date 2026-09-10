const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');
const { normalizeFlatNumber } = require('./_lib/flatNumber');
const { normalizePhone } = require('./_lib/phone');

// Handles /api/pending (list, submit) and /api/pending/:id/approve,
// /api/pending/:id/reject in one function to stay under Vercel Hobby's
// per-deployment function limit.
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.replace(/^\/api\/pending\/?/, '').split('/').filter(Boolean);
  const [id, action] = segments;

  if (!id) {
    if (req.method === 'GET') return handleList(req, res);
    if (req.method === 'POST') return handleSubmit(req, res);
    return fail(res, 405, 'Method not allowed');
  }

  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  if (action === 'approve') return handleApprove(req, res, id);
  if (action === 'reject') return handleReject(req, res, id);
  return fail(res, 404, 'Not found');
};

const HISTORY_PAGE_SIZE = 50;

async function handleList(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { status, page } = req.query;
  const supabase = getSupabaseAdmin();

  // The "pending" queue is the actionable work list — it's expected to
  // stay small in practice and needs to be seen in full, so it's never
  // paginated. Reviewed history (approved/rejected) has no natural
  // ceiling — it accumulates forever — so that's the one paginated here.
  if (status === 'pending') {
    let query = supabase
      .from('pending_approvals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (auth.profile.role === 'security') {
      query = query.eq('submitted_by', auth.profile.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('List pending approvals failed:', error.message);
      return fail(res, 500, 'Failed to fetch pending approvals');
    }
    return ok(res, { entries: data, page: 1, page_size: data.length, total: data.length });
  }

  // status === 'history' (or omitted, for backward compatibility — treated
  // as history too) — paginated, most recent first.
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const from = (pageNum - 1) * HISTORY_PAGE_SIZE;
  const to = from + HISTORY_PAGE_SIZE - 1;

  let query = supabase
    .from('pending_approvals')
    .select('*', { count: 'exact' })
    .neq('status', 'pending')
    .order('reviewed_at', { ascending: false })
    .range(from, to);

  if (auth.profile.role === 'security') {
    query = query.eq('submitted_by', auth.profile.id);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('List pending approval history failed:', error.message);
    return fail(res, 500, 'Failed to fetch submission history');
  }

  return ok(res, { entries: data, page: pageNum, page_size: HISTORY_PAGE_SIZE, total: count || 0 });
}

async function handleSubmit(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { flat_number, occupancy_type, resident_name, phone, email, photo_path, gender } = req.body || {};
  const GENDERS = ['male', 'female'];

  if (!flat_number || !occupancy_type || !resident_name || !phone) {
    return fail(res, 400, 'flat_number, occupancy_type, resident_name, and phone are required');
  }
  if (!['owner', 'tenant', 'owner_offsite'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner, tenant, or owner_offsite', 'occupancy_type');
  }
  if (gender != null && gender !== '' && !GENDERS.includes(gender)) {
    return fail(res, 400, `gender must be one of: ${GENDERS.join(', ')}`, 'gender');
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
      gender: gender || null,
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

async function handleApprove(req, res, id) {
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
}

async function handleReject(req, res, id) {
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
}
