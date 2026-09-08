const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');
const { normalizeFlatNumber } = require('./_lib/flatNumber');
const { normalizePhone } = require('./_lib/phone');

// Handles both /api/residents (list, create) and /api/residents/:id
// (get, update, delete) in one function to stay under Vercel Hobby's
// per-deployment function limit. The id, if present, comes from the
// URL path segment after /api/residents/.
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.replace(/^\/api\/residents\/?/, '').split('/').filter(Boolean);
  const id = segments[0];

  if (!id) {
    if (req.method === 'GET') return handleList(req, res);
    if (req.method === 'POST') return handleCreate(req, res);
    return fail(res, 405, 'Method not allowed');
  }

  if (req.method === 'GET') return handleGet(req, res, id);
  if (req.method === 'PATCH') return handleUpdate(req, res, id);
  if (req.method === 'DELETE') return handleDelete(req, res, id);
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { q, flat } = req.query;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('residents')
    .select(
      'id, flat_number, occupancy_type, resident_name, phone, email, photo_path, status, is_council_member, lease_expiry_date, created_at'
    )
    .eq('status', 'active')
    .order('flat_number', { ascending: true });

  if (flat) {
    query = query.ilike('flat_number', `%${flat}%`);
  }
  if (q) {
    query = query.ilike('resident_name', `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('List residents failed:', error.message);
    return fail(res, 500, 'Failed to fetch residents');
  }

  if (data.length > 0) {
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('resident_id')
      .in('resident_id', data.map((r) => r.id));

    const counts = {};
    (vehicles || []).forEach((v) => {
      counts[v.resident_id] = (counts[v.resident_id] || 0) + 1;
    });
    data.forEach((r) => {
      r.vehicle_count = counts[r.id] || 0;
    });
  }

  return ok(res, data);
}

async function handleCreate(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const {
    flat_number,
    occupancy_type,
    resident_name,
    phone,
    email,
    photo_path,
    is_council_member,
    lease_expiry_date,
  } = req.body || {};

  if (!flat_number || !occupancy_type || !resident_name || !phone) {
    return fail(res, 400, 'flat_number, occupancy_type, resident_name, and phone are required');
  }
  if (!['owner', 'tenant'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner or tenant', 'occupancy_type');
  }
  if (lease_expiry_date && occupancy_type !== 'tenant') {
    return fail(res, 400, 'lease_expiry_date only applies to tenants', 'lease_expiry_date');
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
    .from('residents')
    .insert({
      flat_number: normalizedFlat,
      occupancy_type,
      resident_name,
      phone: normalizedPhone,
      email: email || null,
      photo_path: photo_path || null,
      is_council_member: !!is_council_member,
      lease_expiry_date: lease_expiry_date || null,
      created_by: auth.profile.id,
      approved_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(res, 409, `Flat ${normalizedFlat} already has a resident on record`, 'flat_number');
    }
    console.error('Create resident failed:', error.message);
    return fail(res, 500, 'Failed to create resident');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_created',
    targetTable: 'residents',
    targetId: data.id,
    details: { flat_number: normalizedFlat, occupancy_type },
  });

  return ok(res, data, 201);
}

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

  const {
    flat_number,
    occupancy_type,
    resident_name,
    phone,
    email,
    photo_path,
    is_council_member,
    lease_expiry_date,
  } = req.body || {};

  if (occupancy_type && !['owner', 'tenant'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner or tenant', 'occupancy_type');
  }
  if (lease_expiry_date && occupancy_type === 'owner') {
    return fail(res, 400, 'lease_expiry_date only applies to tenants', 'lease_expiry_date');
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
  if (is_council_member !== undefined) updates.is_council_member = !!is_council_member;
  if (lease_expiry_date !== undefined) updates.lease_expiry_date = lease_expiry_date || null;

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

  if (error) {
    console.error('Delete resident failed:', error.message);
    return fail(res, 500, 'Failed to delete resident');
  }
  if (!data) {
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
