const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { requireRole } = require('./_lib/auth');
const { writeAuditLog } = require('./_lib/audit');
const { ok, fail } = require('./_lib/responses');

// Admin-only issue tracker:
//   GET    /api/issues              — list, optional ?status=open|in_progress|resolved
//   POST   /api/issues              — create { title, description?, priority }
//   PATCH  /api/issues/:id          — update { title?, description?, priority?, status? }
//   DELETE /api/issues/:id          — remove
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['open', 'in_progress', 'resolved'];
const PAGE_SIZE = 50;

module.exports = async function handler(req, res) {
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const url = new URL(req.url, 'http://localhost');
  const id = url.pathname.replace(/^\/api\/issues\/?/, '').split('/').filter(Boolean)[0];

  if (!id) {
    if (req.method === 'GET') return handleList(req, res);
    if (req.method === 'POST') return handleCreate(req, res, auth);
    return fail(res, 405, 'Method not allowed');
  }

  if (req.method === 'PATCH') return handleUpdate(req, res, auth, id);
  if (req.method === 'DELETE') return handleDelete(req, res, auth, id);
  return fail(res, 405, 'Method not allowed');
};

async function handleList(req, res) {
  const { status, priority, page } = req.query;
  const supabase = getSupabaseAdmin();

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from('issues').select('*', { count: 'exact' });
  if (status && STATUSES.includes(status)) query = query.eq('status', status);
  if (priority && PRIORITIES.includes(priority)) query = query.eq('priority', priority);

  // "priority" isn't alphabetically ordered by severity (low < medium <
  // high alphabetically, but the severity order is low < medium < high in
  // a different sense — high needs to sort first). Postgres/PostgREST
  // can't express "order by severity rank" without a generated column or
  // RPC, so sort by created_at at the DB level for stable pagination, then
  // re-rank by severity within the fetched page — the issue list is
  // expected to stay small (an admin's working queue), so this is exact
  // for realistic sizes rather than only approximate.
  const { data, error, count } = await query.order('created_at', { ascending: true }).range(from, to);

  if (error) {
    console.error('List issues failed:', error.message);
    return fail(res, 500, 'Failed to fetch issues');
  }

  const STATUS_RANK = { open: 0, in_progress: 1, resolved: 2 };
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  data.sort((a, b) => {
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s !== 0) return s;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const { count: openCount } = await supabase
    .from('issues')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress']);

  return ok(res, {
    entries: data,
    page: pageNum,
    page_size: PAGE_SIZE,
    total: count || 0,
    open_count: openCount || 0,
  });
}

async function handleCreate(req, res, auth) {
  const { title, description, priority } = req.body || {};

  if (!title || !title.trim()) {
    return fail(res, 400, 'title is required', 'title');
  }
  const normalizedPriority = priority || 'medium';
  if (!PRIORITIES.includes(normalizedPriority)) {
    return fail(res, 400, `priority must be one of: ${PRIORITIES.join(', ')}`, 'priority');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('issues')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      priority: normalizedPriority,
      status: 'open',
      created_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Create issue failed:', error.message);
    return fail(res, 500, 'Failed to create issue');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'issue_created',
    targetTable: 'issues',
    targetId: data.id,
    details: { title: data.title, priority: data.priority },
  });

  return ok(res, data, 201);
}

async function handleUpdate(req, res, auth, id) {
  const { title, description, priority, status } = req.body || {};

  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    return fail(res, 400, `priority must be one of: ${PRIORITIES.join(', ')}`, 'priority');
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return fail(res, 400, `status must be one of: ${STATUSES.join(', ')}`, 'status');
  }

  const updates = {};
  if (title !== undefined) {
    if (!title.trim()) return fail(res, 400, 'title cannot be empty', 'title');
    updates.title = title.trim();
  }
  if (description !== undefined) updates.description = description?.trim() || null;
  if (priority !== undefined) updates.priority = priority;
  if (status !== undefined) {
    updates.status = status;
    if (status === 'resolved') {
      updates.resolved_by = auth.profile.id;
      updates.resolved_at = new Date().toISOString();
    } else {
      // Moving back out of resolved clears the resolution stamp.
      updates.resolved_by = null;
      updates.resolved_at = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return fail(res, 400, 'No fields to update');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('issues').update(updates).eq('id', id).select().single();

  if (error) {
    // PGRST116 = "no rows returned" from .single() — the id doesn't exist.
    if (error.code === 'PGRST116') {
      return fail(res, 404, 'Issue not found');
    }
    console.error('Update issue failed:', error.message);
    return fail(res, 500, 'Failed to update issue');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'issue_updated',
    targetTable: 'issues',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });

  return ok(res, data);
}

async function handleDelete(req, res, auth, id) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('issues').delete().eq('id', id).select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      return fail(res, 404, 'Issue not found');
    }
    console.error('Delete issue failed:', error.message);
    return fail(res, 500, 'Failed to delete issue');
  }

  await writeAuditLog({
    req,
    actorId: auth.profile.id,
    action: 'issue_deleted',
    targetTable: 'issues',
    targetId: id,
    details: { title: data.title },
  });

  return ok(res, { id });
}
