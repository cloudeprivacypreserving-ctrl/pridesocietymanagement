const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');
const { normalizeVehiclePlate } = require('./_lib/vehiclePlate');
const { normalizeFlatNumber } = require('./_lib/flatNumber');

// Handles /api/vehicles (list, create) and /api/vehicles/:id (delete)
// in one function to stay under Vercel Hobby's per-deployment function
// limit. Vehicles belong to a flat (household), not a specific resident —
// a flat can have multiple residents sharing the same vehicles.
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.replace(/^\/api\/vehicles\/?/, '').split('/').filter(Boolean);
  const id = segments[0];

  if (!id) {
    if (req.method === 'GET') return handleList(req, res);
    if (req.method === 'POST') return handleCreate(req, res);
    return fail(res, 405, 'Method not allowed');
  }

  if (req.method === 'DELETE') return handleDelete(req, res, id);
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { flat_number } = req.query;
  if (!flat_number) {
    return fail(res, 400, 'flat_number is required');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, flat_number, plate_number, vehicle_type, created_at')
    .eq('flat_number', flat_number)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('List vehicles failed:', error.message);
    return fail(res, 500, 'Failed to fetch vehicles');
  }

  return ok(res, data);
}

async function handleCreate(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { flat_number, plate_number, vehicle_type } = req.body || {};

  if (!flat_number || !plate_number || !plate_number.trim()) {
    return fail(res, 400, 'flat_number and plate_number are required');
  }
  if (vehicle_type && !['two_wheeler', 'four_wheeler'].includes(vehicle_type)) {
    return fail(res, 400, 'vehicle_type must be two_wheeler or four_wheeler', 'vehicle_type');
  }

  let normalizedFlat;
  try {
    normalizedFlat = normalizeFlatNumber(flat_number);
  } catch (err) {
    return fail(res, 400, err.message, 'flat_number');
  }

  const supabase = getSupabaseAdmin();

  const { data: residentAtFlat, error: residentError } = await supabase
    .from('residents')
    .select('id')
    .eq('flat_number', normalizedFlat)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (residentError || !residentAtFlat) {
    return fail(res, 404, 'No resident found at this flat', 'flat_number');
  }

  let normalizedPlate;
  try {
    normalizedPlate = normalizeVehiclePlate(plate_number);
  } catch (err) {
    return fail(res, 400, err.message, 'plate_number');
  }

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      flat_number: normalizedFlat,
      plate_number: normalizedPlate,
      vehicle_type: vehicle_type || null,
      created_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(res, 409, `Vehicle ${normalizedPlate} is already registered to another flat`, 'plate_number');
    }
    console.error('Create vehicle failed:', error.message);
    return fail(res, 500, 'Failed to add vehicle');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'vehicle_added',
    targetTable: 'vehicles',
    targetId: data.id,
    details: { flat_number: normalizedFlat, plate_number: normalizedPlate },
  });

  return ok(res, data, 201);
}

async function handleDelete(req, res, id) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('vehicles').delete().eq('id', id).select().single();

  if (error || !data) {
    return fail(res, 404, 'Vehicle not found');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'vehicle_removed',
    targetTable: 'vehicles',
    targetId: id,
    details: { flat_number: data.flat_number, plate_number: data.plate_number },
  });

  return ok(res, { id });
}
