const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { ok, fail } = require('./_lib/responses');

// Handles /api/photos/upload-url and /api/photos/signed-url in one
// function to stay under Vercel Hobby's per-deployment function limit.
const BUCKET = 'resident-photos';
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 5; // 5 minutes

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const url = new URL(req.url, 'http://localhost');
  const action = url.pathname.replace(/^\/api\/photos\/?/, '').split('/').filter(Boolean)[0];

  if (action === 'upload-url') return handleUploadUrl(req, res);
  if (action === 'signed-url') return handleSignedUrl(req, res);
  return fail(res, 404, 'Not found');
};

async function handleUploadUrl(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { file_name, content_type, size_bytes } = req.body || {};

  if (!file_name || !content_type) {
    return fail(res, 400, 'file_name and content_type are required');
  }
  if (!ALLOWED_TYPES.includes(content_type)) {
    return fail(res, 400, 'Only JPEG and PNG images are allowed', 'content_type');
  }
  if (typeof size_bytes === 'number' && size_bytes > MAX_BYTES) {
    return fail(res, 400, 'Photo must be 3 MB or smaller', 'size_bytes');
  }

  const supabase = getSupabaseAdmin();

  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${auth.profile.id}/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);

  if (error) {
    console.error('Create signed upload URL failed:', error.message);
    return fail(res, 500, 'Failed to create upload URL');
  }

  return ok(res, { path, signed_url: data.signedUrl, token: data.token });
}

async function handleSignedUrl(req, res) {
  const auth = await requireRole(req, res, ['admin', 'security']);
  if (!auth) return;

  const { path } = req.body || {};
  if (!path) {
    return fail(res, 400, 'path is required');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) {
    console.error('Create signed read URL failed:', error.message);
    return fail(res, 500, 'Failed to create photo URL');
  }

  return ok(res, { signed_url: data.signedUrl, expires_in: SIGNED_URL_EXPIRES_IN_SECONDS });
}
