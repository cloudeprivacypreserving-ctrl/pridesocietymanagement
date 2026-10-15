const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');
const { normalizeFlatNumber } = require('./_lib/flatNumber');
const { normalizePhone } = require('./_lib/phone');
const { toUpperName } = require('./_lib/textCase');

const GENDERS = ['male', 'female'];

// Handles both /api/residents (list, create) and /api/residents/:id
// (get, update, delete) in one function to stay under Vercel Hobby's
// per-deployment function limit. The id, if present, comes from the
// URL path segment after /api/residents/.
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.replace(/^\/api\/residents\/?/, '').split('/').filter(Boolean);
  const id = segments[0];

  if (id === 'bulk') {
    if (req.method === 'GET') return handleBulkExport(req, res);
    if (req.method === 'POST') return handleBulkImport(req, res);
    return fail(res, 405, 'Method not allowed');
  }

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
    gender,
    is_council_member,
    lease_expiry_date,
  } = req.body || {};

  if (!flat_number || !occupancy_type || !resident_name) {
    return fail(res, 400, 'flat_number, occupancy_type, and resident_name are required');
  }
  if (!['owner', 'tenant', 'owner_offsite'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner, tenant, or owner_offsite', 'occupancy_type');
  }
  if (gender != null && gender !== '' && !GENDERS.includes(gender)) {
    return fail(res, 400, `gender must be one of: ${GENDERS.join(', ')}`, 'gender');
  }
  if (lease_expiry_date && occupancy_type !== 'tenant') {
    return fail(res, 400, 'lease_expiry_date only applies to tenants', 'lease_expiry_date');
  }

  const upperName = toUpperName(resident_name);

  let normalizedFlat;
  try {
    normalizedFlat = normalizeFlatNumber(flat_number);
  } catch (err) {
    return fail(res, 400, err.message, 'flat_number');
  }

  // Phone is optional; only validate/normalize it when one is supplied.
  let normalizedPhone = null;
  if (phone != null && String(phone).trim() !== '') {
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (err) {
      return fail(res, 400, err.message, 'phone');
    }
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('residents')
    .insert({
      flat_number: normalizedFlat,
      occupancy_type,
      resident_name: upperName,
      phone: normalizedPhone,
      email: email || null,
      photo_path: photo_path || null,
      gender: gender || null,
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
    req,
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
    gender,
    is_council_member,
    lease_expiry_date,
  } = req.body || {};

  if (occupancy_type && !['owner', 'tenant', 'owner_offsite'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner, tenant, or owner_offsite', 'occupancy_type');
  }
  if (gender != null && gender !== '' && !GENDERS.includes(gender)) {
    return fail(res, 400, `gender must be one of: ${GENDERS.join(', ')}`, 'gender');
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
  if (resident_name !== undefined) updates.resident_name = toUpperName(resident_name);
  if (phone !== undefined) {
    // A blank phone clears the field; a non-blank one must be valid.
    if (phone == null || String(phone).trim() === '') {
      updates.phone = null;
    } else {
      try {
        updates.phone = normalizePhone(phone);
      } catch (err) {
        return fail(res, 400, err.message, 'phone');
      }
    }
  }
  if (email !== undefined) updates.email = email;
  if (photo_path !== undefined) updates.photo_path = photo_path;
  if (gender !== undefined) updates.gender = gender || null;
  if (is_council_member !== undefined) updates.is_council_member = !!is_council_member;
  if (lease_expiry_date !== undefined) updates.lease_expiry_date = lease_expiry_date || null;

  if (Object.keys(updates).length === 0) {
    return fail(res, 400, 'No fields to update');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('residents').update(updates).eq('id', id).select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      return fail(res, 404, 'Resident not found');
    }
    console.error('Update resident failed:', error.message);
    return fail(res, 500, 'Failed to update resident');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'resident_updated',
    targetTable: 'residents',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });

  return ok(res, data);
}

// Bulk import/export uses the same Wing/Flat No./Owner Name/Tenant Name/
// Start+End Date Of Licence columns as the society's existing tenant
// register spreadsheet, so the Admin can keep using that file format —
// upload it as-is, and re-download later in the same shape.
//
// Each row represents one tenancy: the owner-of-record (off-site, since a
// tenant is occupying) and the tenant themselves. A flat can have several
// rows (multiple co-tenants on one lease, repeating the same owner).
const MAX_BULK_ROWS = 1000;

function normalizeBulkFlat(wing, flatNo) {
  const wingStr = String(wing || '').trim();
  const flatStr = String(flatNo || '').trim();
  if (!wingStr || !flatStr) {
    throw new Error('Wing and Flat No. are required');
  }
  return normalizeFlatNumber(`${wingStr}-${flatStr}`);
}

function toDateOnly(value) {
  if (value == null || value === '') return null;
  // The client sends dates pre-converted to 'YYYY-MM-DD' strings (Excel
  // serial dates/Date objects don't survive JSON as-is), but tolerate a
  // raw ISO/parsable string too in case a row came from a plain CSV.
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// Upserts one resident by (flat_number, occupancy_type, resident_name) —
// the same three fields a human would use to recognize "this is the same
// person" on a spreadsheet. Matching is case-insensitive; names are always
// stored upper-cased.
async function upsertBulkResident(supabase, { flatNumber, occupancyType, name, leaseExpiryDate, auth, req }) {
  const upperName = toUpperName(name);

  const { data: existing, error: findError } = await supabase
    .from('residents')
    .select('id')
    .eq('flat_number', flatNumber)
    .eq('occupancy_type', occupancyType)
    .ilike('resident_name', upperName)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  if (existing) {
    const updates = { resident_name: upperName };
    if (occupancyType === 'tenant') updates.lease_expiry_date = leaseExpiryDate;
    const { error: updateError } = await supabase.from('residents').update(updates).eq('id', existing.id);
    if (updateError) throw new Error(updateError.message);
    return { id: existing.id, created: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('residents')
    .insert({
      flat_number: flatNumber,
      occupancy_type: occupancyType,
      resident_name: upperName,
      lease_expiry_date: occupancyType === 'tenant' ? leaseExpiryDate : null,
      created_by: auth.profile.id,
      approved_by: auth.profile.id,
    })
    .select('id')
    .single();

  if (insertError) throw new Error(insertError.message);
  return { id: inserted.id, created: true };
}

async function handleBulkImport(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return fail(res, 400, 'rows must be a non-empty array');
  }
  if (rows.length > MAX_BULK_ROWS) {
    return fail(res, 400, `Cannot import more than ${MAX_BULK_ROWS} rows at once`);
  }

  const supabase = getSupabaseAdmin();
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const rowNum = i + 1;
    try {
      const flatNumber = normalizeBulkFlat(row.wing, row.flat_no);
      const ownerName = String(row.owner_name || '').trim();
      const tenantName = String(row.tenant_name || '').trim();

      if (!ownerName && !tenantName) {
        throw new Error('Owner Name or Tenant Name is required');
      }

      const leaseExpiryDate = toDateOnly(row.end_date);
      const outcome = { row: rowNum, flat_number: flatNumber };

      if (ownerName) {
        const ownerResult = await upsertBulkResident(supabase, {
          flatNumber,
          occupancyType: 'owner_offsite',
          name: ownerName,
          auth,
          req,
        });
        outcome.owner = ownerResult;
      }

      if (tenantName) {
        const tenantResult = await upsertBulkResident(supabase, {
          flatNumber,
          occupancyType: 'tenant',
          name: tenantName,
          leaseExpiryDate,
          auth,
          req,
        });
        outcome.tenant = tenantResult;
      }

      results.push({ ...outcome, status: 'ok' });
    } catch (err) {
      results.push({ row: rowNum, status: 'error', message: err.message });
    }
  }

  const created = results.reduce((n, r) => n + (r.owner?.created ? 1 : 0) + (r.tenant?.created ? 1 : 0), 0);
  const updated = results.reduce(
    (n, r) => n + (r.owner && !r.owner.created ? 1 : 0) + (r.tenant && !r.tenant.created ? 1 : 0),
    0
  );
  const failed = results.filter((r) => r.status === 'error').length;

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'residents_bulk_imported',
    targetTable: 'residents',
    details: { rows: rows.length, created, updated, failed },
  });

  return ok(res, { results, summary: { rows: rows.length, created, updated, failed } });
}

// Exports active tenants (plus their off-site owner, if any) in the same
// Wing/Flat No./Owner Name/Tenant Name/Start+End Date Of Licence shape as
// the source spreadsheet, so a re-download round-trips with re-upload.
async function handleBulkExport(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('residents')
    .select('flat_number, occupancy_type, resident_name, lease_expiry_date, created_at')
    .eq('status', 'active')
    .in('occupancy_type', ['tenant', 'owner_offsite'])
    .order('flat_number', { ascending: true });

  if (error) {
    console.error('Bulk export failed:', error.message);
    return fail(res, 500, 'Failed to export tenants');
  }

  const byFlat = {};
  (data || []).forEach((r) => {
    if (!byFlat[r.flat_number]) byFlat[r.flat_number] = { owners: [], tenants: [] };
    if (r.occupancy_type === 'owner_offsite') byFlat[r.flat_number].owners.push(r);
    else byFlat[r.flat_number].tenants.push(r);
  });

  const rows = [];
  Object.keys(byFlat)
    .sort()
    .forEach((flatNumber) => {
      const [wing, flatNo] = flatNumber.split('-');
      const { owners, tenants } = byFlat[flatNumber];
      const ownerName = owners[0]?.resident_name || '';
      // One row per tenant, same owner repeated — matches the source
      // spreadsheet's convention for co-tenants on one lease.
      tenants.forEach((t) => {
        rows.push({
          wing,
          flat_no: flatNo,
          owner_name: ownerName,
          tenant_name: t.resident_name,
          start_date: null,
          end_date: t.lease_expiry_date || null,
        });
      });
    });

  return ok(res, { rows });
}

async function handleDelete(req, res, id) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('residents').delete().eq('id', id).select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      return fail(res, 404, 'Resident not found');
    }
    console.error('Delete resident failed:', error.message);
    return fail(res, 500, 'Failed to delete resident');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'resident_deleted',
    targetTable: 'residents',
    targetId: id,
    details: { flat_number: data.flat_number },
  });

  return ok(res, { id });
}
