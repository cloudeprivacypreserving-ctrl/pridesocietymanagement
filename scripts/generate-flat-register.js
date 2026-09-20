// Generates a printable flat register: one row per real flat (Tower A/B,
// floors 1-23, units 01-08 = 368 flats), with Flat No. pre-filled and
// blank Name / Count columns to fill in by hand — e.g. for a walk-around
// headcount, or as a reusable blank census sheet.
//
// Produces both:
//   scripts/output/flat-register.csv  — open in Excel/Sheets, reuse/edit
//   scripts/output/flat-register.pdf  — print-ready, grouped by tower/floor
//
// Run:  node scripts/generate-flat-register.js
//
// Re-run anytime — output is deterministic from the building layout, not
// from live resident data, so this needs no database connection.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const TOWERS = ['A', 'B'];
const MIN_FLOOR = 1;
const MAX_FLOOR = 23;
const UNITS_PER_FLOOR = 8;

function allFlats() {
  const floors = [];
  for (const tower of TOWERS) {
    for (let floor = MIN_FLOOR; floor <= MAX_FLOOR; floor++) {
      const units = [];
      for (let unit = 1; unit <= UNITS_PER_FLOOR; unit++) {
        units.push(`${tower}-${floor}${String(unit).padStart(2, '0')}`);
      }
      floors.push({ tower, floor, units });
    }
  }
  return floors;
}

function writeCsv(floors, outPath) {
  const rows = ['Flat No.,Name,Count'];
  for (const { units } of floors) {
    for (const flat of units) {
      rows.push(`${flat},,`);
    }
  }
  fs.writeFileSync(outPath, rows.join('\r\n') + '\r\n', 'utf8');
}

// All rows use explicit y-tracking (never doc.moveDown mixed with manual
// x/y text calls) so the three columns stay aligned and the flow across
// page breaks is predictable.
function writePdf(floors, outPath, title) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(fs.createWriteStream(outPath));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;
  const colFlatX = left;
  const colFlatW = contentWidth * 0.24;
  const colNameX = left + colFlatW;
  const colNameW = contentWidth * 0.5;
  const colCountX = colNameX + colNameW;
  const colCountW = contentWidth * 0.26;

  const rowHeight = 19;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  function newPageIfNeeded(needed) {
    if (doc.y + needed > pageBottom) {
      doc.addPage();
      return true;
    }
    return false;
  }

  function drawColumnHeader(y) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000');
    doc.text('Flat No.', colFlatX, y, { width: colFlatW, lineBreak: false });
    doc.text('Name', colNameX, y, { width: colNameW, lineBreak: false });
    doc.text('Count', colCountX, y, { width: colCountW, lineBreak: false });
    const ruleY = y + 13;
    doc.moveTo(left, ruleY).lineTo(right, ruleY).lineWidth(0.75).strokeColor('#000000').stroke();
    return ruleY + 6;
  }

  function drawRow(y, flat) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
    doc.text(flat, colFlatX, y, { width: colFlatW, lineBreak: false });
    const lineY = y + 11;
    doc
      .moveTo(colNameX, lineY)
      .lineTo(colNameX + colNameW - 8, lineY)
      .lineWidth(0.5)
      .strokeColor('#c9c9c9')
      .stroke();
    doc
      .moveTo(colCountX, lineY)
      .lineTo(colCountX + colCountW - 8, lineY)
      .lineWidth(0.5)
      .strokeColor('#c9c9c9')
      .stroke();
    doc.strokeColor('#000000');
  }

  // Title
  doc.font('Helvetica-Bold').fontSize(16).text(title, left, doc.y, { width: contentWidth, align: 'center' });
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555555')
    .text('Flat No. is pre-filled. Write the resident name and headcount for each flat.', left, doc.y, {
      width: contentWidth,
      align: 'center',
    });
  doc.fillColor('#000000');
  doc.y += 14;

  let currentTower = null;
  for (const { tower, floor, units } of floors) {
    if (tower !== currentTower) {
      currentTower = tower;
      newPageIfNeeded(30);
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d5c53');
      doc.text(`Tower ${tower}`, left, doc.y, { width: contentWidth, underline: true });
      doc.fillColor('#000000');
      doc.y += 10;
    }

    // Keep a floor's header + at least a couple of rows together.
    newPageIfNeeded(20 + 20 + rowHeight * 2);
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`Floor ${floor}`, left, doc.y, { width: contentWidth });
    doc.y += 4;

    let y = drawColumnHeader(doc.y);
    for (const flat of units) {
      if (y + rowHeight > pageBottom) {
        doc.addPage();
        y = drawColumnHeader(doc.margins ? doc.y : doc.y);
      }
      drawRow(y, flat);
      y += rowHeight;
    }
    doc.y = y + 10;
  }

  doc.end();
}

function main() {
  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const floors = allFlats();
  const totalFlats = floors.reduce((n, f) => n + f.units.length, 0);

  const csvPath = path.join(outDir, 'flat-register.csv');
  const pdfPath = path.join(outDir, 'flat-register.pdf');

  writeCsv(floors, csvPath);
  writePdf(floors, pdfPath, 'SOHO Society — Flat Register');

  console.log(`Generated ${totalFlats} flats across ${TOWERS.length} towers x ${MAX_FLOOR} floors x ${UNITS_PER_FLOOR} units.`);
  console.log(`CSV: ${csvPath}`);
  console.log(`PDF: ${pdfPath}`);
}

main();
