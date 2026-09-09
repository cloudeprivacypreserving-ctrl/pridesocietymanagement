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

const RESIDENTS_PAGE_SIZE = 50;

async function handleList(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { q, flat, occupancy_type, page } = req.query;
  const supabase = getSupabaseAdmin();

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const from = (pageNum - 1) * RESIDENTS_PAGE_SIZE;
  const to = from + RESIDENTS_PAGE_SIZE - 1;

  function applyFilters(q_) {
    let query = q_.eq('status', 'active');
    if (flat) query = query.ilike('flat_number', `%${flat}%`);
    if (q) query = query.ilike('resident_name', `%${q}%`);
    if (occupancy_type === 'owner') {
      // The "Owners" filter pill means owner-of-record regardless of
      // whether they live at the flat, so it covers both onsite and
      // offsite owners.
      query = query.in('occupancy_type', ['owner', 'owner_offsite']);
    } else if (occupancy_type && ['tenant', 'owner_offsite'].includes(occupancy_type)) {
      query = query.eq('occupancy_type', occupancy_type);
    }
    return query;
  }

  const { data, error, count } = await applyFilters(
    supabase
      .from('residents')
      .select(
        'id, flat_number, occupancy_type, resident_name, phone, email, photo_path, status, is_council_member, lease_expiry_date, created_at',
        { count: 'exact' }
      )
  )
    .order('flat_number', { ascending: true })
    .range(from, to);

  if (error) {
    console.error('List residents failed:', error.message);
    return fail(res, 500, 'Failed to fetch residents');
  }

  if (data.length > 0) {
    // Vehicles belong to the flat, not a specific resident, so every
    // resident sharing a flat_number shows the same household count.
    const flatNumbers = [...new Set(data.map((r) => r.flat_number))];
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('flat_number')
      .in('flat_number', flatNumbers);

    const counts = {};
    (vehicles || []).forEach((v) => {
      counts[v.flat_number] = (counts[v.flat_number] || 0) + 1;
    });
    data.forEach((r) => {
      r.vehicle_count = counts[r.flat_number] || 0;
    });
  }

  // Totals for the All/Owners/Tenants filter pills — reflect the search/
  // flat filter currently applied (if any), but never the occupancy_type
  // filter, so switching pills always shows counts for all three options.
  // One RPC call instead of three separate count queries.
  const { data: countsRow, error: countsError } = await supabase
    .rpc('resident_occupancy_counts', { p_search: q || null, p_flat: flat || null })
    .single();

  if (countsError) {
    console.error('Resident occupancy counts failed:', countsError.message);
  }

  return ok(res, {
    entries: data,
    page: pageNum,
    page_size: RESIDENTS_PAGE_SIZE,
    total: count || 0,
    counts: {
      all: countsRow?.all_count || 0,
      owner: countsRow?.owner_count || 0,
      tenant: countsRow?.tenant_count || 0,
    },
  });
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
  if (!['owner', 'tenant', 'owner_offsite'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner, tenant, or owner_offsite', 'occupancy_type');
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

  // Other residents sharing this flat — a household can have several
  // (owner + spouse + parents, or multiple co-tenants on one lease).
  const { data: flatmates } = await supabase
    .from('residents')
    .select('id, resident_name, occupancy_type, phone, photo_path')
    .eq('flat_number', data.flat_number)
    .eq('status', 'active')
    .neq('id', id)
    .order('created_at', { ascending: true });

  return ok(res, { ...data, flatmates: flatmates || [] });
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

  if (occupancy_type && !['owner', 'tenant', 'owner_offsite'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner, tenant, or owner_offsite', 'occupancy_type');
  }
  if (lease_expiry_date && occupancy_type && occupancy_type !== 'tenant') {
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
