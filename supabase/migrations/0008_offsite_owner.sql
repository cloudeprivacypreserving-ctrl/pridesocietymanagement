-- A flat that's rented out still has a real owner of record — the
-- landlord — even though they don't live there. Previously occupancy_type
-- only distinguished "owner" (lives here) from "tenant" (rents here), with
-- no way to record an owner who doesn't occupy the flat. This adds
-- 'owner_offsite' as a third occupancy_type: a full resident record (same
-- name/phone/photo fields as any other resident) flagged as the flat's
-- registered owner without being a current occupant.

alter table public.residents drop constraint if exists residents_occupancy_type_check;
alter table public.residents add constraint residents_occupancy_type_check
  check (occupancy_type in ('owner', 'tenant', 'owner_offsite'));

alter table public.pending_approvals drop constraint if exists pending_approvals_occupancy_type_check;
alter table public.pending_approvals add constraint pending_approvals_occupancy_type_check
  check (occupancy_type in ('owner', 'tenant', 'owner_offsite'));

-- Recompute the filter-pill counts to fold owner_offsite into the "owner"
-- bucket for the UI's All/Owners/Tenants pills — an off-site owner is still
-- an owner for that purpose, just not a current occupant.
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
    count(*) filter (where occupancy_type in ('owner', 'owner_offsite')) as owner_count,
    count(*) filter (where occupancy_type = 'tenant') as tenant_count
  from public.residents
  where status = 'active'
    and (p_flat is null or flat_number ilike '%' || p_flat || '%')
    and (p_search is null or resident_name ilike '%' || p_search || '%');
$$;

-- Flags flats that have tenant residents but no owner-of-record (onsite or
-- offsite) at all — used by the admin UI/reporting to surface gaps rather
-- than enforcing this as a hard constraint (a flat mid-transition, e.g. an
-- owner just moved out and hasn't been re-added yet, shouldn't be blocked).
create or replace function public.flats_missing_owner()
returns table (flat_number text, resident_count bigint)
language sql
security definer
stable
set search_path = public
as $$
  select flat_number, count(*) as resident_count
  from public.residents
  where status = 'active'
  group by flat_number
  having count(*) filter (where occupancy_type in ('owner', 'owner_offsite')) = 0
     and count(*) filter (where occupancy_type = 'tenant') > 0;
$$;
