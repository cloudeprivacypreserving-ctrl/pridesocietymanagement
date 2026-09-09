-- The residents list endpoint was making 3 separate round-trips to
-- Supabase just to get the All/Owners/Tenants filter-pill counts (one
-- exact-count query per pill), on top of the main paginated query and
-- the vehicle-count lookup — 5 round-trips per request. Under load
-- (verified with ~1,000 residents), each round-trip's latency stacked up
-- to a genuinely slow ~3-4s response, vs ~0.5s for a single-query
-- endpoint like /api/health. This collapses the 3 pill-count queries
-- into one function call using count(*) filter (where ...), so all
-- three counts come back in a single round-trip.

create or replace function public.resident_occupancy_counts(
  p_search text default null,
  p_flat text default null
)
returns table (all_count bigint, owner_count bigint, tenant_count bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) as all_count,
    count(*) filter (where occupancy_type = 'owner') as owner_count,
    count(*) filter (where occupancy_type = 'tenant') as tenant_count
  from public.residents
  where status = 'active'
    and (p_flat is null or flat_number ilike '%' || p_flat || '%')
    and (p_search is null or resident_name ilike '%' || p_search || '%');
$$;
