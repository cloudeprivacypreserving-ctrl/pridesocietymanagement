const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { requireRole } = require('../_lib/auth');
const { writeAuditLog } = require('../_lib/audit');
const { ok, fail } = require('../_lib/responses');
const { normalizeFlatNumber } = require('../_lib/flatNumber');
const { normalizePhone } = require('../_lib/phone');

module.exports = async function handler(req, res) {
  const { id } = req.query;
  if (!id) return fail(res, 400, 'Missing resident id');

  if (req.method === 'GET') return handleGet(req, res, id);
  if (req.method === 'PATCH') return handleUpdate(req, res, id);
  if (req.method === 'DELETE') return handleDelete(req, res, id);
  return fail(res, 405, 'Method not allowed');
};

async function handleGet(req, res, id) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('residents').select('*').eq('id', id).single();

  if (error || !data) {
    return fail(res, 404, 'Resident not found');
  }

  return ok(res, data);
}

async function handleUpdate(req, res, id) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const { flat_number, occupancy_type, resident_name, phone, email, photo_path } = req.body || {};

  if (occupancy_type && !['owner', 'tenant'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner or tenant', 'occupancy_type');
  }

  const updates = {};
  if (flat_number !== undefined) {
    try {
      updates.flat_number = normalizeFlatNumber(flat_number);
    } catch (err) {
      return fail(res, 400, err.message, 'flat_number');
    }
  }
  if (occupancy_type !== undefined) updates.occupancy_type = occupancy_type;
  if (resident_name !== undefined) updates.resident_name = resident_name;
  if (phone !== undefined) {
    try {
      updates.phone = normalizePhone(phone);
    } catch (err) {
      return fail(res, 400, err.message, 'phone');
    }
  }
  if (email !== undefined) updates.email = email;
  if (photo_path !== undefined) updates.photo_path = photo_path;

  if (Object.keys(updates).length === 0) {
    return fail(res, 400, 'No fields to update');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('residents').update(updates).eq('id', id).select().single();

  if (error) {
    if (error.code === '23505') {
      return fail(res, 409, `Flat ${updates.flat_number} already has a resident on record`, 'flat_number');
    }
    console.error('Update resident failed:', error.message);
    return fail(res, 500, 'Failed to update resident');
  }
  if (!data) {
    return fail(res, 404, 'Resident not found');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_updated',
    targetTable: 'residents',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });

  return ok(res, data);
}

async function handleDelete(req, res, id) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('residents').delete().eq('id', id).select().single();

  if (error || !data) {
    return fail(res, 404, 'Resident not found');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_deleted',
    targetTable: 'residents',
    targetId: id,
    details: { flat_number: data.flat_number },
  });

  return ok(res, { id });
}
