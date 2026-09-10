-- Adds an optional gender field to residents (and pending_approvals so it
-- survives the approval flow). Nullable — existing rows keep no value, and
-- it's never required on entry. Allowed values kept small and explicit.
-- Idempotent: safe to re-run.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'residents' and column_name = 'gender'
  ) then
    alter table public.residents
      add column gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pending_approvals' and column_name = 'gender'
  ) then
    alter table public.pending_approvals
      add column gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say'));
  end if;
end $$;

-- Carry gender across when a pending submission is approved into a
-- resident row.
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
    flat_number, occupancy_type, resident_name, phone, email, photo_path, gender,
    created_by, approved_by
  ) values (
    v_pending.flat_number, v_pending.occupancy_type, v_pending.resident_name,
    v_pending.phone, v_pending.email, v_pending.photo_path, v_pending.gender,
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
end $$;
