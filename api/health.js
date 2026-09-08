const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { ok, fail } = require('./_lib/responses');

module.exports = async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });

    if (error) {
      return fail(res, 503, 'Database unreachable');
    }

    return ok(res, { status: 'healthy', time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check failed:', err.message);
    return fail(res, 503, 'Health check failed');
  }
};
