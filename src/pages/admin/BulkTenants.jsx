import { useState } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { normalizeFlatNumber } from '../../lib/flatNumber';

// Matches the society's existing tenant-register spreadsheet exactly, so
// the same file format keeps working as new batches come in.
const TEMPLATE_HEADERS = ['Wing', 'Flat No.', 'Owner Name', 'Tenant Name', 'Start Date Of Licence', 'End Date Of Licence'];

const UploadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
  </svg>
);
const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
  </svg>
);

function excelDateToIso(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30).
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return `${parsed.y}-${mm}-${dd}`;
  }
  const str = String(value).trim();
  if (!str) return null;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return str; // let the server reject it with a clear error
  return parsed.toISOString().slice(0, 10);
}

function parseWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve(raw);
      } catch (err) {
        reject(new Error('Could not read this file — make sure it is a valid .xlsx or .csv'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file'));
    reader.readAsArrayBuffer(file);
  });
}

// The sheet's headers are matched loosely (case/spacing-insensitive) so
// small formatting drift between exports doesn't break the import.
function normalizeHeaderKey(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

const HEADER_MAP = {
  wing: 'wing',
  flatno: 'flat_no',
  ownername: 'owner_name',
  tenantname: 'tenant_name',
  startdateoflicence: 'start_date',
  startdateoflicense: 'start_date',
  enddateoflicence: 'end_date',
  enddateoflicense: 'end_date',
};

function rowsFromSheet(rawRows) {
  return rawRows.map((raw) => {
    const row = {};
    Object.entries(raw).forEach(([key, value]) => {
      const mapped = HEADER_MAP[normalizeHeaderKey(key)];
      if (mapped) row[mapped] = value;
    });
    return {
      wing: row.wing,
      flat_no: row.flat_no,
      owner_name: row.owner_name,
      tenant_name: row.tenant_name,
      start_date: excelDateToIso(row.start_date),
      end_date: excelDateToIso(row.end_date),
    };
  });
}

function buildPreview(rows, existingByFlat) {
  return rows.map((row, i) => {
    const entry = { rowNum: i + 1, row, issues: [], matches: [] };
    let flatNumber = null;
    try {
      flatNumber = normalizeFlatNumber(`${row.wing}-${row.flat_no}`);
    } catch (err) {
      entry.issues.push(err.message);
    }
    const ownerName = String(row.owner_name || '').trim();
    const tenantName = String(row.tenant_name || '').trim();
    if (!ownerName && !tenantName) {
      entry.issues.push('Owner Name or Tenant Name is required');
    }

    entry.flatNumber = flatNumber;
    entry.ownerName = ownerName;
    entry.tenantName = tenantName;

    if (flatNumber && existingByFlat[flatNumber]) {
      const existing = existingByFlat[flatNumber];
      const ownerMatch = ownerName && existing.owners.some((n) => n.toUpperCase() === ownerName.toUpperCase());
      const tenantMatch = tenantName && existing.tenants.some((n) => n.toUpperCase() === tenantName.toUpperCase());
      if (ownerName) {
        if (ownerMatch) {
          entry.matches.push('Owner matches existing record');
        } else if (existing.owners.length > 0) {
          // A different owner is already on file for this flat — importing
          // will ADD this name as a new owner record rather than replace
          // the old one, so a resale/correction needs the old row cleaned
          // up by hand afterward. Surfaced as a warning, not a hard error,
          // since co-owners are also legitimate.
          entry.warnings = entry.warnings || [];
          entry.warnings.push(`Existing owner on file is "${existing.owners.join(', ')}" — this will be added alongside it, not replace it`);
        } else {
          entry.matches.push('Owner will be created (none on file for this flat)');
        }
      }
      if (tenantName) entry.matches.push(tenantMatch ? 'Tenant matches existing record' : 'Tenant is new/changed for this flat');
    } else if (flatNumber) {
      entry.matches.push('No existing record for this flat — will be created');
    }

    return entry;
  });
}

export default function BulkTenants() {
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [importSummary, setImportSummary] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setImportSummary(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const rawRows = await parseWorkbook(file);
      const rows = rowsFromSheet(rawRows).filter((r) => r.wing || r.flat_no || r.owner_name || r.tenant_name);

      if (rows.length === 0) {
        throw new Error(`No data rows found. Expected columns: ${TEMPLATE_HEADERS.join(', ')}`);
      }

      // Cross-verify against current residents before showing the preview,
      // so the Admin can see at a glance what's new vs. already on file.
      const { rows: currentRows } = await api.get('/residents/bulk');
      const existingByFlat = {};
      (currentRows || []).forEach((r) => {
        const flatNumber = `${r.wing}-${r.flat_no}`;
        if (!existingByFlat[flatNumber]) existingByFlat[flatNumber] = { owners: [], tenants: [] };
        if (r.owner_name) existingByFlat[flatNumber].owners.push(r.owner_name);
        if (r.tenant_name) existingByFlat[flatNumber].tenants.push(r.tenant_name);
      });

      setPreview(buildPreview(rows, existingByFlat));
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setParsing(false);
    }
  }

  function handleInputChange(e) {
    handleFile(e.target.files?.[0]);
  }

  async function handleImport() {
    if (!preview) return;
    const validRows = preview.filter((p) => p.issues.length === 0);
    if (validRows.length === 0) {
      setError('No valid rows to import — fix the flagged rows first');
      return;
    }

    setImporting(true);
    setError('');
    try {
      const payload = validRows.map((p) => p.row);
      const result = await api.post('/residents/bulk', { rows: payload });
      setImportSummary(result.summary);
      setPreview(null);
      setFileName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleDownload() {
    setExporting(true);
    setError('');
    try {
      const { rows } = await api.get('/residents/bulk');
      const sheetRows = rows.map((r) => ({
        Wing: r.wing,
        'Flat No.': r.flat_no,
        'Owner Name': r.owner_name,
        'Tenant Name': r.tenant_name,
        'Start Date Of Licence': r.start_date || '',
        'End Date Of Licence': r.end_date || '',
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows, { header: TEMPLATE_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tenant Details');
      XLSX.writeFile(wb, 'registered-tenants-export.xlsx');
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const issueCount = preview ? preview.filter((p) => p.issues.length > 0).length : 0;
  const okCount = preview ? preview.length - issueCount : 0;

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> Bulk operations
        </span>
        <h1>Bulk tenants</h1>
        <div className="directory-subtitle">
          Upload the tenant register spreadsheet to add/update many flats at once, or download the current list in the same format.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <section className="card" style={{ flex: '1 1 380px', maxWidth: 480 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Upload register</h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginBottom: 12 }}>
            Expected columns: {TEMPLATE_HEADERS.join(', ')}. One row per tenant — repeat the owner's row for co-tenants on the same lease.
          </p>
          <label
            htmlFor="bulk_file"
            className={`dropzone${fileName ? ' dropzone-filled' : ''}`}
            style={{ display: 'block' }}
          >
            <input
              id="bulk_file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleInputChange}
              hidden
            />
            {parsing ? (
              <span className="dropzone-text">Reading file…</span>
            ) : fileName ? (
              <span className="dropzone-text">
                <span className="dropzone-check">&#10003;</span> {fileName}
              </span>
            ) : (
              <span className="dropzone-text">
                {UploadIcon}
                <br />
                Click or drag the .xlsx file here
              </span>
            )}
          </label>
          {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
          {importSummary && (
            <div className="field-flag field-flag-ok" style={{ marginTop: 10, fontSize: 13, display: 'block' }}>
              Imported {importSummary.rows} row{importSummary.rows === 1 ? '' : 's'}: {importSummary.created} created,{' '}
              {importSummary.updated} updated{importSummary.failed > 0 ? `, ${importSummary.failed} failed` : ''}.
            </div>
          )}
        </section>

        <section className="card" style={{ flex: '1 1 300px', maxWidth: 420 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Download current list</h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginBottom: 12 }}>
            Exports every active tenant (with their off-site owner) in the same spreadsheet format, ready to re-upload later.
          </p>
          <button className="btn btn-primary" onClick={handleDownload} disabled={exporting}>
            <span className="btn-icon">{DownloadIcon}</span> {exporting ? 'Preparing…' : 'Download .xlsx'}
          </button>
        </section>
      </div>

      {preview && (
        <section style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Preview — {preview.length} row{preview.length === 1 ? '' : 's'}</h2>
            <span className="pill pill-approved">{okCount} ready</span>
            {issueCount > 0 && <span className="pill pill-pending">{issueCount} need fixing</span>}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Flat</th>
                  <th>Owner</th>
                  <th>Tenant</th>
                  <th>Lease end</th>
                  <th>Cross-check</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr
                    key={p.rowNum}
                    style={
                      p.issues.length > 0
                        ? { background: 'rgba(220, 38, 38, 0.06)' }
                        : p.warnings?.length > 0
                        ? { background: 'rgba(217, 119, 6, 0.07)' }
                        : undefined
                    }
                  >
                    <td>{p.rowNum}</td>
                    <td>{p.flatNumber || `${p.row.wing || '?'}-${p.row.flat_no || '?'}`}</td>
                    <td>{p.ownerName || '—'}</td>
                    <td>{p.tenantName || '—'}</td>
                    <td>{p.row.end_date || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.issues.length > 0 && <div style={{ color: 'var(--danger)' }}>{p.issues.join('; ')}</div>}
                      {p.warnings?.length > 0 && (
                        <div style={{ color: '#b45309' }}>{p.warnings.join('; ')}</div>
                      )}
                      {p.issues.length === 0 && (
                        <div style={{ color: 'var(--ink-dim)' }}>{p.matches.join('; ')}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || okCount === 0}>
              {importing ? 'Importing…' : `Import ${okCount} valid row${okCount === 1 ? '' : 's'}`}
            </button>
            <button className="btn" onClick={() => { setPreview(null); setFileName(''); }} disabled={importing}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </Layout>
  );
}
