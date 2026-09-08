-- Vehicle plate numbers were free text with no format check or
-- uniqueness constraint, so anything could be entered, including the
-- same plate under multiple residents. The API now validates format
-- server-side (api/_lib/vehiclePlate.js); this adds a uniqueness
-- constraint on the normalized plate so the same vehicle can't be
-- registered against two different residents.

alter table public.vehicles
  add constraint vehicles_plate_number_unique unique (plate_number);
