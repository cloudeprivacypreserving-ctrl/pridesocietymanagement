-- A tiny key/value settings table for system-wide toggles that an Admin
-- should be able to flip from the UI without a code change or redeploy —
-- starting with whether MFA is mandatory for Admin accounts. Single row
-- per key, no history; audit_log already records who changed what and
-- when via the API that writes here.
-- Idempotent: safe to re-run.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.app_settings (key, value)
values ('mfa_required', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- Any authenticated admin/security account may read settings (the app
-- needs to know whether to enforce MFA regardless of role). No direct
-- client writes — those go through the API with the service-role key.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select
  using (public.current_role() in ('admin', 'security'));
