const { getSupabaseAdmin } = require('./supabaseAdmin');
const { fail } = require('./responses');

/**
 * Verifies the bearer token from the Authorization header and loads the
 * caller's profile (id + role). Returns null (and writes the error response)
 * if the request is not authenticated.
 */
async function requireUser(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    fail(res, 401, 'Missing bearer token');
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    fail(res, 401, 'Invalid or expired session');
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) {
    fail(res, 403, 'No profile found for this account');
    return null;
  }

  return { authUser: data.user, profile };
}

/**
 * Like requireUser, but also rejects if the caller's role is not in
 * `allowedRoles`. Returns null (and writes the error response) on failure.
 */
async function requireRole(req, res, allowedRoles) {
  const result = await requireUser(req, res);
  if (!result) return null;

  if (!allowedRoles.includes(result.profile.role)) {
    fail(res, 403, 'You do not have permission to perform this action');
    return null;
  }

  return result;
}

module.exports = { requireUser, requireRole };
