-- Supports multiple residents per flat (e.g. owner + spouse + parents, or
-- several co-tenants on one lease). flat_number was previously unique per
-- resident row; that's no longer correct — many residents can legitimately
-- share a flat_number. Vehicles move from belonging to one resident to
-- belonging to the flat as a whole, since a household's vehicles aren't
-- tied to whichever specific person's name is in the app.

-- Drop the per-resident flat uniqueness. The approval RPC's duplicate
-- protection (approve_pending_submission) never relied on this constraint —
-- it guards against double-approving the same pending_approvals row via
-- a status check, which is unaffected by this change.
alter table public.residents drop constraint if exists residents_flat_number_key;

-- Vehicles: move from resident_id to flat_number.
alter table public.vehicles add column if not exists flat_number text;

-- Backfill flat_number from the linked resident for any existing rows.
update public.vehicles v
set flat_number = r.flat_number
from public.residents r
where v.resident_id = r.id
  and v.flat_number is null;

alter table public.vehicles alter column flat_number set not null;

drop index if exists idx_vehicles_resident_id;
create index if not exists idx_vehicles_flat_number on public.vehicles (flat_number);

alter table public.vehicles drop constraint if exists vehicles_resident_id_fkey;
alter table public.vehicles drop column if exists resident_id;
