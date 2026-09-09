// Generates ~1,000 synthetic residents for load-testing pagination,
// search, and the multi-resident-per-flat feature against the live
// database. Every record is clearly tagged (name prefix "LOADTEST ") so
// it's trivially identifiable and safe to bulk-remove afterward via
// scripts/cleanup-load-test-data.js.
//
// Run:  node scripts/generate-load-test-data.js
//
// Distribution (per-flat, not per-resident — every resident at a flat
// shares a coherent occupancy story, matching how real households work):
//   - Spread across the real building layout: towers A/B, floors 1-23,
//     units 01-08 (368 possible flats).
//   - ~70% of flats are owner-occupied: 2-4 residents, all occupancy_type
//     'owner' (spouse/parents living together).
//   - ~30% of flats are rented out: 2-5 'tenant' residents (co-tenants on
//     one lease) PLUS exactly one 'owner_offsite' record for the landlord,
//     so every tenant-occupied flat still has an owner of record on file.
//   - Reaches ~1,000 total residents across all 368 real flats.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const TARGET_RESIDENT_COUNT = 1000;
const OWNER_RATIO = 0.7;
const BATCH_SIZE = 100;
const NAME_PREFIX = 'LOADTEST';

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kavya', 'Myra',
  'Anika', 'Pari', 'Riya', 'Ira', 'Rohan', 'Kabir', 'Aryan', 'Dhruv', 'Karan',
  'Neha', 'Priya', 'Sneha', 'Pooja', 'Meera', 'Rajesh', 'Suresh', 'Ramesh',
  'Mahesh', 'Vijay', 'Sunita', 'Anita', 'Geeta', 'Lata', 'Usha',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Kumar', 'Singh', 'Patel', 'Shah', 'Mehta',
  'Rao', 'Reddy', 'Nair', 'Iyer', 'Joshi', 'Desai', 'Kulkarni', 'Chopra',
  'Malhotra', 'Kapoor', 'Bose', 'Chatterjee',
];
const RELATIONS = ['', ' (spouse)', ' (parent)', ' (co-tenant)'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone() {
  const prefix = randomFrom(['6', '7', '8', '9']);
  let rest = '';
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return prefix + rest;
}

function allFlats() {
  const flats = [];
  for (const tower of ['A', 'B']) {
    for (let floor = 1; floor <= 23; floor++) {
      for (let unit = 1; unit <= 8; unit++) {
        flats.push(`${tower}-${floor}${String(unit).padStart(2, '0')}`);
      }
    }
  }
  return flats;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your local .env');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let adminId = null;
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const match = authUsers?.users?.find((u) => u.email === process.env.BOOTSTRAP_ADMIN_EMAIL);
    if (match) adminId = match.id;
  }
  if (!adminId) {
    const { data: anyAdmin } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
    adminId = anyAdmin?.id || null;
  }
  if (!adminId) {
    console.error('Could not find an Admin profile to attribute this test data to. Aborting.');
    process.exit(1);
  }
  console.log(`Attributing load-test residents to admin profile: ${adminId}`);

  // Distribute TARGET_RESIDENT_COUNT residents across flats. occupancy_type
  // is decided once per flat, not per resident, so every household is
  // internally consistent — either an owner-occupied flat (all 'owner'), or
  // a rented flat with tenant co-residents PLUS one 'owner_offsite' record
  // for the landlord.
  const flats = shuffle(allFlats());
  const rows = [];
  let flatIndex = 0;

  while (rows.length < TARGET_RESIDENT_COUNT && flatIndex < flats.length) {
    const flat = flats[flatIndex++];
    const isRented = Math.random() >= OWNER_RATIO;

    if (isRented) {
      // Landlord of record — doesn't live here, still on file.
      rows.push({
        flat_number: flat,
        occupancy_type: 'owner_offsite',
        resident_name: `${NAME_PREFIX} ${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`,
        phone: randomPhone(),
        email: null,
        is_council_member: false,
        lease_expiry_date: null,
        created_by: adminId,
        approved_by: adminId,
      });

      // Only 368 real flats exist (2 towers x 23 floors x 8 units), so
      // reaching ~1,000 residents needs an average of ~2.7 residents/flat.
      // Rented flats get 2-5 co-tenants sharing one lease.
      const tenantCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < tenantCount && rows.length < TARGET_RESIDENT_COUNT; i++) {
        rows.push({
          flat_number: flat,
          occupancy_type: 'tenant',
          resident_name: `${NAME_PREFIX} ${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}${i === 0 ? '' : randomFrom(RELATIONS)}`,
          phone: randomPhone(),
          email: null,
          is_council_member: false,
          lease_expiry_date: '2027-12-31',
          created_by: adminId,
          approved_by: adminId,
        });
      }
    } else {
      // Owner-occupied flat: 2-4 owner residents (spouse/parents).
      const residentsHere = Math.random() < 0.5 ? 2 : 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < residentsHere && rows.length < TARGET_RESIDENT_COUNT; i++) {
        rows.push({
          flat_number: flat,
          occupancy_type: 'owner',
          resident_name: `${NAME_PREFIX} ${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}${i === 0 ? '' : randomFrom(RELATIONS)}`,
          phone: randomPhone(),
          email: null,
          is_council_member: false,
          lease_expiry_date: null,
          created_by: adminId,
          approved_by: adminId,
        });
      }
    }
  }

  if (rows.length < TARGET_RESIDENT_COUNT) {
    console.warn(`Only ${rows.length} residents fit across all ${flats.length} real flats (target was ${TARGET_RESIDENT_COUNT}). Proceeding with ${rows.length}.`);
  }

  const ownerCount = rows.filter((r) => r.occupancy_type === 'owner').length;
  const offsiteOwnerCount = rows.filter((r) => r.occupancy_type === 'owner_offsite').length;
  const tenantCount = rows.filter((r) => r.occupancy_type === 'tenant').length;
  const flatsUsed = new Set(rows.map((r) => r.flat_number)).size;
  console.log(`Generated ${rows.length} residents across ${flatsUsed} flats (${ownerCount} owners, ${offsiteOwnerCount} off-site owners, ${tenantCount} tenants).`);

  console.log(`\nInserting in batches of ${BATCH_SIZE}...`);
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('residents').insert(batch).select('id');

    if (error) {
      console.error(`Batch starting at row ${i} failed: ${error.message}`);
      failed += batch.length;
    } else {
      inserted += data.length;
      console.log(`  Inserted ${inserted}/${rows.length}`);
    }
  }

  console.log(`\nDone. Inserted: ${inserted}. Failed: ${failed}.`);
  console.log(`\nAll test residents are named starting with "${NAME_PREFIX}". Run scripts/cleanup-load-test-data.js when you're done browsing to remove them.`);
}

main().catch((err) => {
  console.error('Load test generation failed:', err);
  process.exit(1);
});
