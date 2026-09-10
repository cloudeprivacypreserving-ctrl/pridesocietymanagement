const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');

// Admin-only user management:
//   GET    /api/users                  — list all Admin/Security accounts
//   POST   /api/users                  — invite a new user by email
//   POST   /api/users  { action: 'set-password', user_id, password }
//                                      — set a user's password directly
//                                        (used to reset a Security officer's
//                                        password; the Admin then hands the
//                                        new password over in person).
//   DELETE /api/users/:id              — permanently remove a user
//   POST   /api/users  { action: 'delete', user_id }  — same as DELETE,
//                                        for clients that can't send a body
//                                        with DELETE.
module.exports = async function handler(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const url = new URL(req.url, 'http://localhost');
  const pathId = url.pathname.replace(/^\/api\/users\/?/, '').split('/').filter(Boolean)[0];

  if (req.method === 'GET') return handleList(req, res, auth);
  if (req.method === 'DELETE') return handleDelete(req, res, auth, pathId);
  if (req.method === 'POST') {
    const action = (req.body || {}).action;
    if (action === 'set-password') return handleSetPassword(req, res, auth);
    if (action === 'delete') return handleDelete(req, res, auth, (req.body || {}).user_id);
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

async function handleDelete(req, res, auth, userId) {
  if (!userId) return fail(res, 400, 'A user id is required');

  if (userId === auth.profile.id) {
    return fail(res, 400, 'You cannot delete your own account');
  }

  const supabase = getSupabaseAdmin();

  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .single();

  if (targetError || !target) {
    return fail(res, 404, 'User not found');
  }

  // Never remove the last Admin — there must always be at least one
  // account that can manage users.
  if (target.role === 'admin') {
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (countError) {
      console.error('Admin count failed:', countError.message);
      return fail(res, 500, 'Failed to verify remaining admins');
    }
    if ((count || 0) <= 1) {
      return fail(res, 400, 'Cannot delete the last Admin account');
    }
  }

  // Records this user created/reviewed reference profiles(id) with no
  // ON DELETE rule, so those FKs would block the delete. Null them out
  // first — the history rows stay, they just lose the "who" pointer.
  // (auth_log.actor_id is kept for entries other than the one we're
  // about to write; it's nulled last so this delete stays attributable.)
  const detachError =
    (await supabase.from('residents').update({ created_by: null }).eq('created_by', userId)).error ||
    (await supabase.from('residents').update({ approved_by: null }).eq('approved_by', userId)).error ||
    (await supabase.from('pending_approvals').update({ submitted_by: null }).eq('submitted_by', userId)).error ||
    (await supabase.from('pending_approvals').update({ reviewed_by: null }).eq('reviewed_by', userId)).error;

  if (detachError) {
    console.error('Detaching user references failed:', detachError.message);
    return fail(res, 500, 'Failed to detach the user from existing records');
  }

  // Write the audit entry while the acting Admin still exists, then
  // detach this user's own past audit entries.
  await writeAuditLog({
    actorId: auth.profile.id,
    action: 'user_deleted',
    targetTable: 'profiles',
    targetId: userId,
    details: { full_name: target.full_name, role: target.role },
  });

  await supabase.from('audit_log').update({ actor_id: null }).eq('actor_id', userId);

  // Deleting the auth user cascades to profiles(id) (ON DELETE CASCADE).
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('Delete auth user failed:', deleteError.message);
    return fail(res, 500, 'Failed to delete the user account');
  }

  return ok(res, { id: userId });
}
