const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireUser, requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');

// Handles:
//   POST /api/profile/complete-setup  (authenticated) — clears the
//     must_change_password flag after a first-login password set.
//   POST /api/profile/request-reset   (UNauthenticated) — self-service
//     password reset by email, restricted to Admin accounts. Security
//     accounts are reset by an Admin in-app, not by email, so a
//     request for a non-admin address is silently ignored.
//   GET  /api/profile/settings        (authenticated) — reads global
//     app settings (currently just mfa_required) so the frontend knows
//     whether to enforce MFA for this session.
//   POST /api/profile/settings { mfa_required }  (admin only) — flips a
//     global setting. Applies to every account immediately, not just the
//     caller's — there's no per-user override.
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const action = url.pathname.replace(/^\/api\/profile\/?/, '').split('/').filter(Boolean)[0];

  if (action === 'settings') {
    if (req.method === 'GET') return handleGetSettings(req, res);
    if (req.method === 'POST') return handleUpdateSettings(req, res);
    return fail(res, 405, 'Method not allowed');
  }

  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  if (action === 'complete-setup') return handleCompleteSetup(req, res);
  if (action === 'request-reset') return handleRequestReset(req, res);
  return fail(res, 404, 'Not found');
};

async function handleGetSettings(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('app_settings').select('key, value').eq('key', 'mfa_required').single();

  if (error) {
    console.error('Load settings failed:', error.message);
    // Fail safe toward the stricter behavior (MFA required) rather than
    // silently relaxing security if the settings row is unreadable.
    return ok(res, { mfa_required: true });
  }

  return ok(res, { mfa_required: data.value === true });
}

async function handleUpdateSettings(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const { mfa_required } = req.body || {};
  if (typeof mfa_required !== 'boolean') {
    return fail(res, 400, 'mfa_required must be true or false', 'mfa_required');
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('app_settings')
    .update({ value: mfa_required, updated_at: new Date().toISOString(), updated_by: auth.profile.id })
    .eq('key', 'mfa_required');

  if (error) {
    console.error('Update settings failed:', error.message);
    return fail(res, 500, 'Failed to update setting');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'settings_updated',
    targetTable: 'app_settings',
    details: { key: 'mfa_required', value: mfa_required },
  });

  return ok(res, { mfa_required });
}

async function handleCompleteSetup(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', auth.profile.id);

  if (error) {
    console.error('Failed to clear must_change_password:', error.message);
    return fail(res, 500, 'Failed to complete account setup');
  }

  return ok(res, { id: auth.profile.id, must_change_password: false });
}

async function handleRequestReset(req, res) {
  const { email } = req.body || {};

  // Always respond the same way regardless of whether the address exists
  // or is eligible — this endpoint must not reveal which emails are
  // registered or which are Admins.
  const genericResponse = () =>
    ok(res, {
      message:
        'If this address belongs to an Admin account, a password reset link has been sent to it.',
    });

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return genericResponse();
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = getSupabaseAdmin();

  // Look up the auth user by email, then confirm their profile role is
  // 'admin'. Only then do we actually send the recovery email.
  let isEligibleAdmin = false;
  let authUserId = null;
  try {
    // getUserByEmail isn't in older supabase-js; fall back to listUsers.
    let authUser = null;
    if (typeof supabase.auth.admin.getUserByEmail === 'function') {
      const { data } = await supabase.auth.admin.getUserByEmail(normalizedEmail);
      authUser = data?.user || null;
    } else {
      const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      authUser = (data?.users || []).find(
        (u) => (u.email || '').toLowerCase() === normalizedEmail
      );
    }

    if (authUser) {
      authUserId = authUser.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authUser.id)
        .single();
      isEligibleAdmin = profile?.role === 'admin';
    }
  } catch (err) {
    console.error('request-reset lookup failed:', err.message);
    return genericResponse();
  }

  if (!isEligibleAdmin) {
    // Not an admin (security account, or unknown address) — do nothing,
    // but respond identically.
    return genericResponse();
  }

  // Where the recovery link should land. Prefer an explicit env var so
  // this is stable regardless of which host the request came from (a
  // reset triggered from localhost must still send a production link).
  // Fall back to the request's forwarded host, then to the known prod URL.
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const requestOrigin = host ? `${proto}://${host}` : '';
  const siteUrl = (
    process.env.PUBLIC_SITE_URL ||
    (requestOrigin && !requestOrigin.includes('localhost') ? requestOrigin : '') ||
    'https://pridesocietymanagement.vercel.app'
  ).replace(/\/$/, '');
  const redirectTo = `${siteUrl}/set-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });

  if (error) {
    console.error('resetPasswordForEmail failed:', error.message);
    // Still respond generically — don't surface send failures to an
    // unauthenticated caller.
    return genericResponse();
  }

  await writeAuditLog({
    req,
    actorId: authUserId,
    action: 'admin_password_reset_requested',
    targetTable: 'profiles',
    targetId: authUserId,
    details: { method: 'email', self_service: true },
  });

  return genericResponse();
}
