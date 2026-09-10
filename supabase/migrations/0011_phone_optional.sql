-- Phone becomes optional for residents. Not every resident (especially
-- family members like children or elderly parents) has their own mobile
-- number on file. Drops NOT NULL on phone for residents and
-- pending_approvals; existing values are unaffected.
-- Idempotent: safe to re-run.

alter table public.residents alter column phone drop not null;
alter table public.pending_approvals alter column phone drop not null;
