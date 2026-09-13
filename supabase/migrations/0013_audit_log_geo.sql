-- Adds request origin (IP + coarse geolocation) to audit_log so an Admin
-- can spot actions from an unexpected location — extra visibility
-- alongside MFA, useful since there are only a couple of accounts.
-- Location comes from Vercel's automatic geolocation headers
-- (x-vercel-ip-*), not a paid lookup service, so it's ISP/city-level, not
-- precise. Nullable — local dev (scripts/dev-api-server.js) and any
-- request without those headers just leaves them blank.
-- Idempotent: safe to re-run.

alter table public.audit_log
  add column if not exists ip_address text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text;
