-- Narrows the resident gender field to just 'male' / 'female'. The wider
-- set added in 0009 ('other', 'prefer_not_to_say') is being dropped per
-- product decision. Any existing rows carrying the dropped values are set
-- back to null first so the tighter CHECK can be applied.
-- Idempotent: safe to re-run.

update public.residents
  set gender = null
  where gender is not null and gender not in ('male', 'female');

update public.pending_approvals
  set gender = null
  where gender is not null and gender not in ('male', 'female');

alter table public.residents drop constraint if exists residents_gender_check;
alter table public.residents
  add constraint residents_gender_check check (gender in ('male', 'female'));

alter table public.pending_approvals drop constraint if exists pending_approvals_gender_check;
alter table public.pending_approvals
  add constraint pending_approvals_gender_check check (gender in ('male', 'female'));
