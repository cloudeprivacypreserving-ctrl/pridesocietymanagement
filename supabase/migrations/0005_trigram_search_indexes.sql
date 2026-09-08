-- Resident search uses ilike '%...%' (a leading-wildcard pattern match) on
-- flat_number and resident_name. Plain B-tree indexes (created in 0001)
-- cannot serve a leading-wildcard pattern at all — Postgres falls back to a
-- full sequential scan regardless of the index existing. This adds trigram
-- (GIN) indexes, which pg_trgm can use for arbitrary substring matches,
-- so search stays index-backed as the resident list grows.

create extension if not exists pg_trgm;

drop index if exists idx_residents_flat_number;
drop index if exists idx_residents_resident_name;

create index if not exists idx_residents_flat_number_trgm
  on public.residents using gin (flat_number gin_trgm_ops);

create index if not exists idx_residents_resident_name_trgm
  on public.residents using gin (resident_name gin_trgm_ops);
