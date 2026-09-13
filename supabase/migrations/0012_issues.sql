-- Admin issue tracker: lets an Admin log things that need attention
-- (maintenance, complaints, follow-ups) with a priority, and move them
-- through a simple Open -> In Progress -> Resolved workflow. Admin-only
-- end to end — Security has no visibility into this table.
-- Idempotent: safe to re-run.

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_by uuid references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_issues_status on public.issues (status);
create index if not exists idx_issues_priority on public.issues (priority);
create index if not exists idx_issues_created_at on public.issues (created_at desc);

drop trigger if exists set_issues_updated_at on public.issues;
create trigger set_issues_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

alter table public.issues enable row level security;

-- Admin-only read. Writes go through the API using the service-role key,
-- same pattern as every other table.
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues
  for select
  using (public.current_role() = 'admin');
