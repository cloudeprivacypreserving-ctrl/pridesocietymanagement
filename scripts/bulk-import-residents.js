// Bulk-imports residents from a CSV file, reusing the same validators the
// API uses so imported data is held to the same standard as anything
// entered through the app. Run locally:
//
//   node scripts/bulk-import-residents.js path/to/residents.csv [--dry-run]
//
// CSV columns (header row required), in any order:
//   flat_number, occupancy_type, resident_name, phone (optional), email (optional),
//   gender (optional: male/female),
//   is_council_member (optional, "true"/"false"), lease_expiry_date (optional, YYYY-MM-DD)
//
// Multiple rows may share the same flat_number — a flat can have several
// residents (e.g. owner + spouse + parents, or several co-tenants on one
// lease). flat_number is no longer unique per resident.
//
// Imported residents are marked as approved by whichever admin account
// owns SUPABASE_SERVICE_ROLE_KEY — there's no "imported by" concept
// separate from created_by/approved_by, so this uses BOOTSTRAP_ADMIN_EMAIL's
// profile if set, or the first admin profile found otherwise.
//
// Runs in batches (default 50) with a short delay between batches to stay
// well under Supabase's request-rate ceiling — not because of the free-tier
// request limit (there isn't one), but so a single import doesn't hammer
// the database with hundreds of near-simultaneous inserts.
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { normalizeFlatNumber } = require('../api/_lib/flatNumber');
const { normalizePhone } = require('../api/_lib/phone');

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 300;

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    return row;
  });
}

async function main() {
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!filePath) {
    console.error('Usage: node scripts/bulk-import-residents.js path/to/residents.csv [--dry-run]');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your local .env');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(raw);
  console.log(`Read ${rows.length} rows from ${filePath}`);

  // Resolve the admin profile to attribute these imports to.
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
    console.error('Could not find an Admin profile to attribute this import to. Aborting.');
    process.exit(1);
  }
  console.log(`Attributing imported residents to admin profile: ${adminId}`);

  const validRows = [];
  const rejectedRows = [];

  rows.forEach((row, i) => {
    const lineNum = i + 2; // +1 for header, +1 for 1-indexing
    try {
      if (!row.flat_number || !row.occupancy_type || !row.resident_name) {
        throw new Error('flat_number, occupancy_type, and resident_name are required');
      }
      if (!['owner', 'tenant', 'owner_offsite'].includes(row.occupancy_type.toLowerCase())) {
        throw new Error(`occupancy_type must be "owner", "tenant", or "owner_offsite", got "${row.occupancy_type}"`);
      }

      const flat_number = normalizeFlatNumber(row.flat_number);
      // Phone is optional — validate only if a value is present.
      const phone = (row.phone || '').trim() ? normalizePhone(row.phone) : null;
      const occupancy_type = row.occupancy_type.toLowerCase();
      const lease_expiry_date = row.lease_expiry_date || null;

      if (lease_expiry_date && occupancy_type !== 'tenant') {
        throw new Error('lease_expiry_date only applies to tenants');
      }

      const gender = (row.gender || '').toLowerCase() || null;
      if (gender && !['male', 'female'].includes(gender)) {
        throw new Error(`gender must be male or female, got "${row.gender}"`);
      }

      validRows.push({
        flat_number,
        occupancy_type,
        resident_name: row.resident_name,
        gender,
        phone,
        email: row.email || null,
        is_council_member: String(row.is_council_member).toLowerCase() === 'true',
        lease_expiry_date,
        created_by: adminId,
        approved_by: adminId,
      });
    } catch (err) {
      rejectedRows.push({ line: lineNum, row, error: err.message });
    }
  });

  console.log(`\nValidated: ${validRows.length} OK, ${rejectedRows.length} rejected`);
  if (rejectedRows.length > 0) {
    console.log('\nRejected rows (fix these in the CSV and re-run):');
    rejectedRows.forEach((r) => {
      console.log(`  line ${r.line}: ${r.error} — ${JSON.stringify(r.row)}`);
    });
  }

  if (dryRun) {
    console.log('\n--dry-run: no rows were inserted. Re-run without --dry-run to actually import.');
    return;
  }

  if (validRows.length === 0) {
    console.log('\nNothing to import.');
    return;
  }

  console.log(`\nImporting ${validRows.length} residents in batches of ${BATCH_SIZE}...`);
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('residents').insert(batch).select('id, flat_number');

    if (error) {
      // A batch-level error (e.g. one duplicate flat_number) fails the
      // whole batch under a single insert — fall back to inserting this
      // batch's rows one at a time so one bad row doesn't block the rest.
      console.warn(`Batch starting at row ${i} failed as a whole (${error.message}); retrying rows individually...`);
      for (const row of batch) {
        const { error: rowError } = await supabase.from('residents').insert(row);
        if (rowError) {
          failed++;
          console.error(`  FAILED ${row.flat_number} (${row.resident_name}): ${rowError.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += data.length;
      console.log(`  Inserted batch: ${data.map((d) => d.flat_number).join(', ')}`);
    }

    if (i + BATCH_SIZE < validRows.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log(`\nDone. Inserted: ${inserted}. Failed: ${failed}. Skipped (validation): ${rejectedRows.length}.`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
