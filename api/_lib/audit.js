const { getSupabaseAdmin } = require('./supabaseAdmin');

/**
 * Writes an audit_log row. Never pass tokens, passwords, or other secrets
 * in `details` — it is stored as-is in jsonb.
 */
async function writeAuditLog({ actorId, action, targetTable = null, targetId = null, details = null }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    details,
  });

  if (error) {
    // Audit logging failures must not break the primary action, but should
    // be visible in server logs for investigation.
    console.error('Failed to write audit log:', error.message);
  }
}

module.exports = { writeAuditLog };
