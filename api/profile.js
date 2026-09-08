const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireUser } = require('./_lib/auth');
const { ok, fail } = require('./_lib/responses');

// Handles /api/profile/complete-setup. A single action today, but kept
// as its own file (rather than folded into another) since it's called
// from an unauthenticated-feeling context (first login) and is likely
// to grow its own actions later.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const url = new URL(req.url, 'http://localhost');
  const action = url.pathname.replace(/^\/api\/profile\/?/, '').split('/').filter(Boolean)[0];

  if (action !== 'complete-setup') return fail(res, 404, 'Not found');

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
};
