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

  const { q, flat } = req.query;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('residents')
    .select('id, flat_number, occupancy_type, resident_name, phone, email, photo_path, status, created_at')
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

  return ok(res, data);
}

async function handleCreate(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const { flat_number, occupancy_type, resident_name, phone, email, photo_path } = req.body || {};

  if (!flat_number || !occupancy_type || !resident_name || !phone) {
    return fail(res, 400, 'flat_number, occupancy_type, resident_name, and phone are required');
  }
  if (!['owner', 'tenant'].includes(occupancy_type)) {
    return fail(res, 400, 'occupancy_type must be owner or tenant', 'occupancy_type');
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('residents')
    .insert({
      flat_number,
      occupancy_type,
      resident_name,
      phone,
      email: email || null,
      photo_path: photo_path || null,
      created_by: auth.profile.id,
      approved_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(res, 409, `Flat ${flat_number} already has a resident on record`, 'flat_number');
    }
    console.error('Create resident failed:', error.message);
    return fail(res, 500, 'Failed to create resident');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'resident_created',
    targetTable: 'residents',
    targetId: data.id,
    details: { flat_number, occupancy_type },
  });

  return ok(res, data, 201);
}
