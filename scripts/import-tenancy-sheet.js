// Imports the society's tenancy spreadsheet (one flat per row, with both
// the owner and the current tenant on the same row) into the residents
// table. Each row becomes TWO resident records:
//
//   • the owner  -> occupancy_type 'owner_offsite' (they don't live in the
//                   rented flat; a tenant does)
//   • the tenant -> occupancy_type 'tenant', with lease_expiry_date set
//                   from "End Date Of Licence"
//
// Export the sheet as CSV first (Excel: File → Save As → CSV UTF-8), then:
//
//   node scripts/import-tenancy-sheet.js path/to/sheet.csv [--dry-run]
//
// Expected columns (header row required; matched case-insensitively, and
// common variants of each name are accepted):
//
//   Flat No.              -> flat number (A-101 / B-2308 style)
//   Owner Name            -> owner's full name
//   Tenant name           -> tenant's full name
//   Start Date Of Licence -> informational only (not stored today)
//   End Date Of Licence   -> tenant lease_expiry_date
//   Owner Phone   (optional, future)
//   Tenant Phone  (optional, future)
//   Owner Gender / Tenant Gender (optional, male/female)
//
// A future OWNERS-ONLY sheet (Flat No. + Owner Name, no tenant) can be
// imported with:  --sheet owners
//   → each row becomes a single 'owner' resident (lives in the flat).
//
// Idempotent-ish: re-running will insert duplicates. If you need to
// re-import, clear the affected residents first.
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { normalizeFlatNumber } = require('../api/_lib/flatNumber');
const { normalizePhone } = require('../api/_lib/phone');

const BATCH_SIZE = 50;

// ---- CSV parsing (handles quoted fields with commas) ----
function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.some((v) => v.trim() !== '')) rows.push(record);
      record = [];
    } else field += c;
  }
  if (field !== '' || record.length) {
    record.push(field);
    if (record.some((v) => v.trim() !== '')) rows.push(record);
  }
  return rows;
}

// Map a header cell to a canonical key, tolerating spacing/punctuation/case.
function canonicalHeader(h) {
  const k = h.toLowerCase().replace(/[^a-z]/g, '');
  const map = {
    flatno: 'flat',
    flatnumber: 'flat',
    flat: 'flat',
    ownername: 'owner_name',
    owner: 'owner_name',
    tenantname: 'tenant_name',
    tenant: 'tenant_name',
    startdateoflicence: 'start_date',
    startdateoflicense: 'start_date',
    startdate: 'start_date',
    enddateoflicence: 'end_date',
    enddateoflicense: 'end_date',
    enddate: 'end_date',
    ownerphone: 'owner_phone',
    ownermobile: 'owner_phone',
    tenantphone: 'tenant_phone',
    tenantmobile: 'tenant_phone',
    ownergender: 'owner_gender',
    tenantgender: 'tenant_gender',
  };
  return map[k] || k;
}

// DD/MM/YYYY or DD-MM-YYYY (also accepts YYYY-MM-DD) -> YYYY-MM-DD
function toIsoDate(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    const day = parseInt(d, 10);
    const mon = parseInt(mo, 10);
    if (day < 1 || day > 31 || mon < 1 || mon > 12) {
      throw new Error(`Unparseable date "${raw}" (day/month out of range)`);
    }
    return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  throw new Error(`Unrecognised date format "${raw}" — expected DD/MM/YYYY or YYYY-MM-DD`);
}

function optPhone(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  return normalizePhone(s); // throws on a bad number
}

function optGender(raw) {
  const g = (raw || '').trim().toLowerCase();
  if (!g) return null;
  if (!['male', 'female'].includes(g)) throw new Error(`gender must be male/female, got "${raw}"`);
  return g;
}

async function main() {
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const sheetIdx = process.argv.indexOf('--sheet');
  const sheetType = sheetIdx !== -1 ? (process.argv[sheetIdx + 1] || '') : 'tenancy';

  if (!filePath || !['tenancy', 'owners'].includes(sheetType)) {
    console.error('Usage: node scripts/import-tenancy-sheet.js <sheet.csv> [--dry-run] [--sheet tenancy|owners]');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Attribute the import to an admin profile.
  let adminId = null;
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
    const { data } = await supabase.auth.admin.listUsers();
    adminId = data?.users?.find((u) => u.email === process.env.BOOTSTRAP_ADMIN_EMAIL)?.id || null;
  }
  if (!adminId) {
    const { data } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
    adminId = data?.id || null;
  }
  if (!adminId) {
    console.error('No admin profile found to attribute this import to. Aborting.');
    process.exit(1);
  }
  console.log(`Attributing import to admin profile: ${adminId}`);

  const grid = parseCsv(fs.readFileSync(filePath, 'utf8'));
  if (grid.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }
  const headers = grid[0].map(canonicalHeader);
  const dataRows = grid.slice(1).map((cells) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (cells[i] ?? '').trim(); });
    return o;
  });
  console.log(`Read ${dataRows.length} data rows. Detected columns: ${headers.join(', ')}`);

  const residents = [];
  const rejected = [];

  dataRows.forEach((row, i) => {
    const line = i + 2;
    try {
      if (!row.flat) throw new Error('missing Flat No.');
      const flat_number = normalizeFlatNumber(row.flat);

      if (sheetType === 'owners') {
        if (!row.owner_name) throw new Error('missing Owner Name');
        residents.push({
          flat_number,
          occupancy_type: 'owner',
          resident_name: row.owner_name,
          gender: optGender(row.owner_gender),
          phone: optPhone(row.owner_phone),
          email: null,
          is_council_member: false,
          lease_expiry_date: null,
          created_by: adminId,
          approved_by: adminId,
        });
        return;
      }

      // tenancy sheet: owner + tenant on one row
      if (!row.owner_name && !row.tenant_name) {
        throw new Error('row has neither Owner Name nor Tenant name');
      }
      const leaseEnd = toIsoDate(row.end_date);
      const hasTenant = !!row.tenant_name;

      if (row.owner_name) {
        residents.push({
          flat_number,
          // If the row also names a tenant, the owner is off-site (the
          // tenant lives there). If there's no tenant on the row, treat
          // the owner as living in the flat.
          occupancy_type: hasTenant ? 'owner_offsite' : 'owner',
          resident_name: row.owner_name,
          gender: optGender(row.owner_gender),
          phone: optPhone(row.owner_phone),
          email: null,
          is_council_member: false,
          lease_expiry_date: null,
          created_by: adminId,
          approved_by: adminId,
        });
      }
      if (row.tenant_name) {
        residents.push({
          flat_number,
          occupancy_type: 'tenant',
          resident_name: row.tenant_name,
          gender: optGender(row.tenant_gender),
          phone: optPhone(row.tenant_phone),
          email: null,
          is_council_member: false,
          lease_expiry_date: leaseEnd,
          created_by: adminId,
          approved_by: adminId,
        });
      }
    } catch (err) {
      rejected.push({ line, row, error: err.message });
    }
  });

  console.log(`\nBuilt ${residents.length} resident records from ${dataRows.length} rows (${rejected.length} rows rejected).`);
  if (rejected.length) {
    console.log('\nRejected rows — fix in the sheet and re-run:');
    rejected.forEach((r) => console.log(`  line ${r.line}: ${r.error} — ${JSON.stringify(r.row)}`));
  }

  // Summary by flat + type
  const byFlat = {};
  residents.forEach((r) => {
    byFlat[r.flat_number] = byFlat[r.flat_number] || [];
    byFlat[r.flat_number].push(r.occupancy_type);
  });
  const flatsMissingOwner = Object.entries(byFlat)
    .filter(([, types]) => types.includes('tenant') && !types.some((t) => t === 'owner' || t === 'owner_offsite'))
    .map(([f]) => f);
  if (flatsMissingOwner.length) {
    console.log(`\nNote: ${flatsMissingOwner.length} flat(s) will have a tenant but no owner on file: ${flatsMissingOwner.join(', ')}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing inserted. Sample of what would be created:');
    residents.slice(0, 6).forEach((r) => console.log('  ', JSON.stringify(r)));
    return;
  }
  if (!residents.length) {
    console.log('\nNothing to import.');
    return;
  }

  console.log(`\nInserting ${residents.length} residents in batches of ${BATCH_SIZE}...`);
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < residents.length; i += BATCH_SIZE) {
    const batch = residents.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('residents').insert(batch).select('id');
    if (error) {
      console.error(`  batch @${i} failed: ${error.message}`);
      failed += batch.length;
    } else {
      inserted += data.length;
      console.log(`  inserted ${inserted}/${residents.length}`);
    }
  }
  console.log(`\nDone. Inserted ${inserted}, failed ${failed}.`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
