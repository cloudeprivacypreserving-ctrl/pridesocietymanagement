-- Deleting an approved resident was blocked by a foreign key violation,
-- since pending_approvals.resident_id still pointed at it with no
-- cascade behavior. History should survive resident deletion (same
-- principle as rejected submissions never being deleted), so the link
-- is nulled out instead of blocking the delete.

alter table public.pending_approvals
  drop constraint if exists pending_approvals_resident_id_fkey;

alter table public.pending_approvals
  add constraint pending_approvals_resident_id_fkey
  foreign key (resident_id) references public.residents(id) on delete set null;
