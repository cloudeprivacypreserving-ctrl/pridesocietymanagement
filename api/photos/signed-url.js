const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { requireRole } = require('../_lib/auth');
const { ok, fail } = require('../_lib/responses');

const BUCKET = 'resident-photos';
const EXPIRES_IN_SECONDS = 60 * 5; // 5 minutes

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { path } = req.body || {};
  if (!path) {
    return fail(res, 400, 'path is required');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES_IN_SECONDS);

  if (error) {
    console.error('Create signed read URL failed:', error.message);
    return fail(res, 500, 'Failed to create photo URL');
  }

  return ok(res, { signed_url: data.signedUrl, expires_in: EXPIRES_IN_SECONDS });
};
