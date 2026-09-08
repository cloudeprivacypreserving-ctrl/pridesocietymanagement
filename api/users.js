const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'Method not allowed');
  }

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const { email, full_name, role } = req.body || {};

  if (!email || !full_name || !role) {
    return fail(res, 400, 'email, full_name, and role are required');
  }
  if (!['admin', 'security'].includes(role)) {
    return fail(res, 400, 'role must be admin or security', 'role');
  }

  const supabase = getSupabaseAdmin();

  const { data: created, error: createError } = await supabase.auth.admin.inviteUserByEmail(email);

  if (createError || !created?.user) {
    const message = createError?.message || 'Failed to create user';
    const status = message.toLowerCase().includes('already') ? 409 : 400;
    return fail(res, status, message);
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: created.user.id,
    full_name,
    role,
    must_change_password: true,
  });

  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned account.
    await supabase.auth.admin.deleteUser(created.user.id);
    return fail(res, 500, 'Failed to create user profile');
  }

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'user_created',
    targetTable: 'profiles',
    targetId: created.user.id,
    details: { email, full_name, role },
  });

  return ok(res, { id: created.user.id, email, full_name, role }, 201);
};
