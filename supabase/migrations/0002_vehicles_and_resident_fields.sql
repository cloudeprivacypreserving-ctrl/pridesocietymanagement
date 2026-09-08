-- Adds council-member flag and lease expiry to residents, plus a
-- vehicles table for basic per-resident vehicle registration.
-- Idempotent: safe to re-run.

alter table public.residents
  add column if not exists is_council_member boolean not null default false,
  add column if not exists lease_expiry_date date;

-- =========================================================
-- vehicles
-- =========================================================
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  plate_number text not null,
  vehicle_type text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicles_resident_id on public.vehicles (resident_id);

alter table public.vehicles enable row level security;

-- vehicles: any authenticated admin/security may read. No direct client writes.
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select
  using (public.current_role() in ('admin', 'security'));

-- No insert/update/delete policy — writes go through the API using the
-- service-role key, same pattern as every other table.
