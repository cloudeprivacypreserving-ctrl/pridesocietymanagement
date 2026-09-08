-- Society Entry Management System — initial schema
-- Idempotent: safe to re-run against a fresh database.

create extension if not exists pgcrypto;

-- =========================================================
-- profiles
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'security')),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- residents
-- =========================================================
create table if not exists public.residents (
  id uuid primary key default gen_random_uuid(),
  flat_number text not null unique,
  occupancy_type text not null check (occupancy_type in ('owner', 'tenant')),
  resident_name text not null,
  phone text not null,
  email text,
  photo_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_residents_flat_number on public.residents (flat_number);
create index if not exists idx_residents_resident_name on public.residents (resident_name);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_residents_updated_at on public.residents;
create trigger trg_residents_updated_at
  before update on public.residents
  for each row execute function public.set_updated_at();

-- =========================================================
-- pending_approvals
-- =========================================================
create table if not exists public.pending_approvals (
  id uuid primary key default gen_random_uuid(),
  flat_number text not null,
  occupancy_type text not null check (occupancy_type in ('owner', 'tenant')),
  resident_name text not null,
  phone text not null,
  email text,
  photo_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  resident_id uuid references public.residents(id),
  submitted_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_pending_status on public.pending_approvals (status);
create index if not exists idx_pending_submitted_by on public.pending_approvals (submitted_by);

-- =========================================================
-- audit_log
-- =========================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc);

-- =========================================================
-- Role helper (security definer to avoid recursive RLS lookups)
-- =========================================================
create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.residents enable row level security;
alter table public.pending_approvals enable row level security;
alter table public.audit_log enable row level security;

-- profiles: user reads own row; admins read all. No direct client writes.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  using (id = auth.uid() or public.current_role() = 'admin');

-- residents: any authenticated admin/security may read. No direct client writes.
drop policy if exists residents_select on public.residents;
create policy residents_select on public.residents
  for select
  using (public.current_role() in ('admin', 'security'));

-- pending_approvals: security sees own submissions; admin sees all. No direct client writes.
drop policy if exists pending_select on public.pending_approvals;
create policy pending_select on public.pending_approvals
  for select
  using (
    public.current_role() = 'admin'
    or submitted_by = auth.uid()
  );

-- audit_log: admin only. No direct client writes.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select
  using (public.current_role() = 'admin');

-- No insert/update/delete policies are defined for any table: all writes happen
-- exclusively through Vercel serverless functions using the service-role key,
-- which bypasses RLS. This is intentional — RLS here is a read-side safety net.

-- =========================================================
-- approve_pending_submission: atomic, duplicate-safe approval.
-- Locks the pending row, verifies it is still pending, inserts the
-- resident, and updates the pending row — all in one transaction so a
-- double-click or retry can never create two residents from one submission.
-- =========================================================
create or replace function public.approve_pending_submission(p_pending_id uuid, p_reviewer_id uuid)
returns public.residents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.pending_approvals%rowtype;
  v_resident public.residents%rowtype;
begin
  select * into v_pending
  from public.pending_approvals
  where id = p_pending_id
  for update;

  if not found then
    raise exception 'pending_not_found' using errcode = 'P0002';
  end if;

  if v_pending.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  insert into public.residents (
    flat_number, occupancy_type, resident_name, phone, email, photo_path,
    created_by, approved_by
  ) values (
    v_pending.flat_number, v_pending.occupancy_type, v_pending.resident_name,
    v_pending.phone, v_pending.email, v_pending.photo_path,
    v_pending.submitted_by, p_reviewer_id
  )
  returning * into v_resident;

  update public.pending_approvals
  set status = 'approved',
      resident_id = v_resident.id,
      reviewed_by = p_reviewer_id,
      reviewed_at = now()
  where id = p_pending_id;

  return v_resident;
end;
$$;
