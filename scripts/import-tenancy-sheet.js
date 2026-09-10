// Imports the society's tenancy spreadsheet into the residents table.
//
//   node scripts/import-tenancy-sheet.js "SOHO PROJECT TENANT DETAILS.xlsx" [--dry-run]
//   node scripts/import-tenancy-sheet.js sheet.csv [--dry-run]
//   node scripts/import-tenancy-sheet.js owners.xlsx --sheet owners [--dry-run]
//
// Reads .xlsx directly (no manual CSV export) or a plain .csv.
//
// Sheet layout (tenancy):
//   Sr. No. | Flat No. | Owner Name | Tenant name | Start Date Of Licence | End Date Of Licence
//
//   - A flat can span several rows: the first row has Flat No. + Owner +
//     the first tenant; the rows below it with a BLANK Flat No. are extra
//     co-tenants on the same flat/lease. Flat number, owner and the lease
//     dates are carried down to those continuation rows.
//   - Dates may be Excel serial numbers (e.g. 46210) or DD/MM/YYYY.
//   - Each flat produces:
//       owner  -> 'owner_offsite' when the flat has a tenant, else 'owner'
//       tenant -> 'tenant', lease_expiry_date = End Date Of Licence
//
// Optional future columns, picked up automatically when present:
//   Owner Phone / Tenant Phone   (validated as Indian mobiles)
//   Owner Gender / Tenant Gender  (male/female)
//
// --sheet owners : an owners-only sheet (Flat No. + Owner Name) -> one
//                  'owner' resident per row.
//
// Known fix-up: Flat No. "B17006" (row for owner SHRIMATI BHALEKAR PREETI)
// is treated as "B1706" per the society's confirmation.
require('dotenv').config();
const fs = require('fs');
const zlib = require('zlib');
const { createClient } = require('@supabase/supabase-js');
const { normalizeFlatNumber } = require('../api/_lib/flatNumber');
const { normalizePhone } = require('../api/_lib/phone');

const BATCH_SIZE = 50;
const FLAT_FIXUPS = { B17006: 'B1706' };

// ---------------------------------------------------------------------------
// Minimal ZIP reader — enough to pull a few XML entries out of an .xlsx.
// Supports STORED (0) and DEFLATE (8) entries via the central directory.
// ---------------------------------------------------------------------------
function readZipEntries(buf) {
  // Find End Of Central Directory record (signature 0x06054b50), scanning
  // back from the end (allow up to 64KB of trailing comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid zip/xlsx (no EOCD record)');
  const cdCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  const entries = {};
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Bad central directory header');
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    // Local file header at localOff: 30-byte fixed part + name + extra.
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('Bad local file header');
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    entries[name] = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlText(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function colToIndex(ref) {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Parse the first worksheet into a 2D array of strings.
function parseXlsx(buf) {
  const entries = readZipEntries(buf);

  // shared strings
  const shared = [];
  if (entries['xl/sharedStrings.xml']) {
    const xml = entries['xl/sharedStrings.xml'].toString('utf8');
    for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) || []) {
      const parts = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      shared.push(parts.map((p) => xmlText(p.replace(/<t\b[^>]*>/, '').replace(/<\/t>/, ''))).join(''));
    }
  }

  // first worksheet (by workbook order → sheet1.xml is the usual name, but
  // resolve via workbook.xml.rels to be safe)
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (entries['xl/workbook.xml'] && entries['xl/_rels/workbook.xml.rels']) {
    const wb = entries['xl/workbook.xml'].toString('utf8');
    const firstRid = (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    if (firstRid) {
      const rels = entries['xl/_rels/workbook.xml.rels'].toString('utf8');
      const target = (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`)) || [])[1];
      if (target) sheetPath = 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '');
    }
  }
  const sheetXml = (entries[sheetPath] || entries['xl/worksheets/sheet1.xml']).toString('utf8');

  const grid = [];
  for (const rowXml of sheetXml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const rowNum = parseInt((rowXml.match(/<row\b[^>]*\br="(\d+)"/) || [])[1] || '0', 10);
    const cells = [];
    for (const cellXml of rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (cellXml.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const ci = colToIndex(ref);
      const type = (cellXml.match(/\bt="([^"]+)"/) || [])[1];
      let val = '';
      if (type === 'inlineStr') {
        const m = cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        val = m ? xmlText(m[1]) : '';
      } else {
        const m = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        const raw = m ? m[1] : '';
        val = type === 's' ? (shared[parseInt(raw, 10)] ?? '') : xmlText(raw);
      }
      cells[ci] = val;
    }
    grid[rowNum - 1] = cells;
  }
  // normalise: no holes, all strings
  const width = grid.reduce((w, r) => Math.max(w, (r || []).length), 0);
  return grid.map((r) => {
    const out = [];
    for (let i = 0; i < width; i++) out.push(((r || [])[i] ?? '').toString());
    return out;
  });
}

// ---- CSV parsing (quoted fields with commas/newlines) ----
function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      rows.push(record); record = [];
    } else field += c;
  }
  if (field !== '' || record.length) { record.push(field); rows.push(record); }
  return rows;
}

function canonicalHeader(h) {
  const k = h.toLowerCase().replace(/[^a-z]/g, '');
  const map = {
    srno: 'sr_no', serialno: 'sr_no', sno: 'sr_no',
    flatno: 'flat', flatnumber: 'flat', flat: 'flat',
    ownername: 'owner_name', owner: 'owner_name',
    tenantname: 'tenant_name', tenant: 'tenant_name',
    startdateoflicence: 'start_date', startdateoflicense: 'start_date', startdate: 'start_date',
    enddateoflicence: 'end_date', enddateoflicense: 'end_date', enddate: 'end_date',
    ownerphone: 'owner_phone', ownermobile: 'owner_phone',
    tenantphone: 'tenant_phone', tenantmobile: 'tenant_phone',
    ownergender: 'owner_gender', tenantgender: 'tenant_gender',
  };
  return map[k] || k;
}

// Excel serial number OR DD/MM/YYYY OR YYYY-MM-DD -> YYYY-MM-DD
function toIsoDate(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  // Excel serial (1900 date system). Serial 1 = 1900-01-01, with the
  // well-known 1900-leap-year bug meaning serial 60 = fake 1900-02-29;
  // subtracting 25569 and treating as days-since-1970 handles all real
  // modern dates correctly.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 59 && serial < 200000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d)) {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
          d.getUTCDate()
        ).padStart(2, '0')}`;
      }
    }
    throw new Error(`Numeric date "${raw}" is out of the expected range`);
  }

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    const day = +d;
    const mon = +mo;
    if (day < 1 || day > 31 || mon < 1 || mon > 12) throw new Error(`Bad date "${raw}"`);
    return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  throw new Error(`Unrecognised date "${raw}"`);
}

function optPhone(raw) {
  const s = (raw || '').trim();
  return s ? normalizePhone(s) : null;
}
function optGender(raw) {
  const g = (raw || '').trim().toLowerCase();
  if (!g) return null;
  if (!['male', 'female'].includes(g)) throw new Error(`gender must be male/female, got "${raw}"`);
  return g;
}
function cleanName(raw) {
  return (raw || '').replace(/\s+/g, ' ').trim();
}
function fixFlat(raw) {
  const t = (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return FLAT_FIXUPS[t] || t;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sIdx = args.indexOf('--sheet');
  const sheetType = sIdx !== -1 ? args[sIdx + 1] : 'tenancy';
  const filePath = args.find((a) => !a.startsWith('--') && a !== sheetType);

  if (!filePath || !['tenancy', 'owners'].includes(sheetType)) {
    console.error('Usage: node scripts/import-tenancy-sheet.js <sheet.xlsx|sheet.csv> [--dry-run] [--sheet tenancy|owners]');
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

  // Load into a 2D grid.
  const fileBuf = fs.readFileSync(filePath);
  const isXlsx = filePath.toLowerCase().endsWith('.xlsx') || fileBuf.slice(0, 2).toString() === 'PK';
  const grid = isXlsx ? parseXlsx(fileBuf) : parseCsv(fileBuf.toString('utf8'));

  // Find the header row (the one containing "Flat No.").
  let headerIdx = grid.findIndex((r) => r.some((c) => canonicalHeader(c) === 'flat'));
  if (headerIdx === -1) {
    console.error('Could not find a header row containing "Flat No.".');
    process.exit(1);
  }
  const headers = grid[headerIdx].map(canonicalHeader);
  const dataGrid = grid.slice(headerIdx + 1);
  const rows = dataGrid.map((cells) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (cells[i] ?? '').toString().trim(); });
    return o;
  });
  console.log(`Found header at grid row ${headerIdx + 1}. Columns: ${headers.filter(Boolean).join(', ')}`);
  console.log(`${rows.length} data rows to process.`);

  const residents = [];
  const rejected = [];
  const ownerSeenForFlat = new Set();

  // Carry-down context for continuation rows.
  let curFlat = null;
  let curLeaseEnd = null;

  rows.forEach((row, i) => {
    const line = headerIdx + 2 + i; // 1-based grid row
    try {
      const rawFlat = fixFlat(row.flat);

      if (sheetType === 'owners') {
        if (!rawFlat) throw new Error('missing Flat No.');
        const flat_number = normalizeFlatNumber(rawFlat);
        const name = cleanName(row.owner_name);
        if (!name) throw new Error('missing Owner Name');
        residents.push({
          flat_number,
          occupancy_type: 'owner',
          resident_name: name,
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

      // --- tenancy sheet ---
      const owner = cleanName(row.owner_name);
      const tenant = cleanName(row.tenant_name);

      if (rawFlat) {
        // New flat block.
        const flat_number = normalizeFlatNumber(rawFlat); // throws on bad flat
        curFlat = flat_number;
        curLeaseEnd = row.end_date ? toIsoDate(row.end_date) : null;

        if (owner) {
          residents.push({
            flat_number,
            occupancy_type: tenant ? 'owner_offsite' : 'owner',
            resident_name: owner,
            gender: optGender(row.owner_gender),
            phone: optPhone(row.owner_phone),
            email: null,
            is_council_member: false,
            lease_expiry_date: null,
            created_by: adminId,
            approved_by: adminId,
          });
          ownerSeenForFlat.add(flat_number);
        }
        if (tenant) {
          residents.push({
            flat_number,
            occupancy_type: 'tenant',
            resident_name: tenant,
            gender: optGender(row.tenant_gender),
            phone: optPhone(row.tenant_phone),
            email: null,
            is_council_member: false,
            lease_expiry_date: curLeaseEnd,
            created_by: adminId,
            approved_by: adminId,
          });
        }
        if (!owner && !tenant) throw new Error('flat row has neither Owner nor Tenant name');
        return;
      }

      // Continuation row: blank/garbage Flat No., carry down.
      if (!curFlat) throw new Error('continuation row before any flat row');
      const contOwner = owner;
      const contTenant = tenant;
      if (contOwner && !ownerSeenForFlat.has(curFlat)) {
        residents.push({
          flat_number: curFlat,
          occupancy_type: contTenant ? 'owner_offsite' : 'owner_offsite',
          resident_name: contOwner,
          gender: optGender(row.owner_gender),
          phone: optPhone(row.owner_phone),
          email: null,
          is_council_member: false,
          lease_expiry_date: null,
          created_by: adminId,
          approved_by: adminId,
        });
        ownerSeenForFlat.add(curFlat);
      }
      if (contTenant) {
        residents.push({
          flat_number: curFlat,
          occupancy_type: 'tenant',
          resident_name: contTenant,
          gender: optGender(row.tenant_gender),
          phone: optPhone(row.tenant_phone),
          email: null,
          is_council_member: false,
          lease_expiry_date: row.end_date ? toIsoDate(row.end_date) : curLeaseEnd,
          created_by: adminId,
          approved_by: adminId,
        });
      }
      if (!contOwner && !contTenant) {
        // fully blank row — skip silently
      }
    } catch (err) {
      rejected.push({ line, row, error: err.message });
    }
  });

  console.log(`\nBuilt ${residents.length} resident records (${rejected.length} rows rejected).`);
  if (rejected.length) {
    console.log('\nRejected rows — fix in the sheet and re-run:');
    rejected.forEach((r) => console.log(`  grid row ${r.line}: ${r.error} — ${JSON.stringify(r.row)}`));
  }

  // Per-flat summary.
  const byFlat = {};
  residents.forEach((r) => {
    (byFlat[r.flat_number] = byFlat[r.flat_number] || []).push(r.occupancy_type);
  });
  const flatCount = Object.keys(byFlat).length;
  const ownerCt = residents.filter((r) => r.occupancy_type === 'owner').length;
  const offsiteCt = residents.filter((r) => r.occupancy_type === 'owner_offsite').length;
  const tenantCt = residents.filter((r) => r.occupancy_type === 'tenant').length;
  console.log(`\n${flatCount} flats — ${ownerCt} owners, ${offsiteCt} off-site owners, ${tenantCt} tenants.`);

  const missingOwner = Object.entries(byFlat)
    .filter(([, ts]) => ts.includes('tenant') && !ts.some((t) => t.startsWith('owner')))
    .map(([f]) => f);
  if (missingOwner.length) {
    console.log(`\n${missingOwner.length} flat(s) will have tenant(s) but no owner on file: ${missingOwner.join(', ')}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing inserted. Full list:');
    residents.forEach((r) =>
      console.log(`  ${r.flat_number.padEnd(7)} ${r.occupancy_type.padEnd(13)} ${r.resident_name}${r.lease_expiry_date ? '  (lease → ' + r.lease_expiry_date + ')' : ''}`)
    );
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
