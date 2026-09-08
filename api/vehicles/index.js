const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { requireRole } = require('../_lib/auth');
const { writeAuditLog } = require('../_lib/audit');
const { ok, fail } = require('../_lib/responses');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { resident_id } = req.query;
  if (!resident_id) {
    return fail(res, 400, 'resident_id is required');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, resident_id, plate_number, vehicle_type, created_at')
    .eq('resident_id', resident_id)
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

  const { resident_id, plate_number, vehicle_type } = req.body || {};

  if (!resident_id || !plate_number || !plate_number.trim()) {
    return fail(res, 400, 'resident_id and plate_number are required');
  }

  const supabase = getSupabaseAdmin();

  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id')
    .eq('id', resident_id)
    .single();

  if (residentError || !resident) {
    return fail(res, 404, 'Resident not found', 'resident_id');
  }

  const normalizedPlate = plate_number.trim().toUpperCase().replace(/\s+/g, ' ');

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      resident_id,
      plate_number: normalizedPlate,
      vehicle_type: vehicle_type || null,
      created_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Create vehicle failed:', error.message);
    return fail(res, 500, 'Failed to add vehicle');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'vehicle_added',
    targetTable: 'vehicles',
    targetId: data.id,
    details: { resident_id, plate_number: normalizedPlate },
  });

  return ok(res, data, 201);
}
