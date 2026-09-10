const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');

// Admin-only user management:
//   GET  /api/users                    — list all Admin/Security accounts
//   POST /api/users                    — invite a new user by email
//   POST /api/users  { action: 'set-password', user_id, password }
//                                      — set a user's password directly
//                                        (used to reset a Security officer's
//                                        password; the Admin then hands the
//                                        new password over in person).
module.exports = async function handler(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  if (req.method === 'GET') return handleList(req, res, auth);
  if (req.method === 'POST') {
    const action = (req.body || {}).action;
    if (action === 'set-password') return handleSetPassword(req, res, auth);
    return handleInvite(req, res, auth);
  }
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const supabase = getSupabaseAdmin();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, must_change_password, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('List users failed:', error.message);
    return fail(res, 500, 'Failed to load users');
  }

  // Pull emails from auth.users (not stored on profiles).
  let emailById = {};
  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    (data?.users || []).forEach((u) => {
      emailById[u.id] = u.email;
    });
  } catch (err) {
    console.error('listUsers for emails failed:', err.message);
  }

  const users = (profiles || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    email: emailById[p.id] || null,
    must_change_password: p.must_change_password,
    created_at: p.created_at,
  }));

  return ok(res, { users });
}

async function handleInvite(req, res, auth) {
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
}

const MIN_PASSWORD_LENGTH = 10;

async function handleSetPassword(req, res, auth) {
  const { user_id, password } = req.body || {};

  if (!user_id || !password) {
    return fail(res, 400, 'user_id and password are required');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return fail(res, 400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'password');
  }

  const supabase = getSupabaseAdmin();

  // Confirm the target is a real Admin/Security profile before touching
  // the auth account.
  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user_id)
    .single();

  if (targetError || !target) {
    return fail(res, 404, 'User not found');
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user_id, { password });

  if (updateError) {
    console.error('Set password failed:', updateError.message);
    return fail(res, 500, 'Failed to set the new password');
  }

  // The Admin sets the working password and hands it over in person, so
  // the account is immediately usable — no forced change on next login.
  await supabase.from('profiles').update({ must_change_password: false }).eq('id', user_id);

  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'user_password_reset',
    targetTable: 'profiles',
    targetId: user_id,
    details: { by: 'admin', target_role: target.role },
  });

  return ok(res, { id: user_id, full_name: target.full_name, role: target.role });
}
