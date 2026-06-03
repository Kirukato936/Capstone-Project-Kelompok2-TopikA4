/**
 * Seed Database Script for Inspectra QC System
 * 
 * Generates realistic inspection data to populate the database.
 * Run this once after first setup: node scripts/seed-database.js
 * 
 * Creates ~250 inspection records spread across today,
 * plus some data for the last 14 days for trend charts.
 */

const path = require('path');

// Load modules from backend
const db = require(path.join(__dirname, '../backend/db'));
const dataService = require(path.join(__dirname, '../backend/data-service'));
const auditLogger = require(path.join(__dirname, '../backend/audit-logger'));

const PART_CONFIG = dataService.getPartConfig();
const PART_NAMES = dataService.getPartNames();
const VENDORS = dataService.getVendors();

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateInspections(date, count) {
  const rows = [];
  const base = new Date(date);
  base.setHours(7, 0, 0, 0);
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const ts = new Date(base.getTime() + i * 180000); // 3 min apart
    
    // Jika tanggalnya hari ini, jangan buat data melebihi jam sekarang
    if (date.toDateString() === now.toDateString() && ts > now) {
      break;
    }
    
    const partName = pick(PART_NAMES);
    const config = PART_CONFIG[partName];
    const target = config.target;
    
    const ok = Math.random() > 0.035;
    const actual = ok ? target : target + (Math.random() < 0.5 ? -rnd(1, 3) : rnd(1, 2));
    const weight = parseFloat((actual * config.weightPer + rnd(0, 3) * 0.1).toFixed(1));
    
    // Format ke local time string untuk DB
    const tzoffset = ts.getTimezoneOffset() * 60000;
    const timestamp = (new Date(ts.getTime() - tzoffset)).toISOString().slice(0, 19).replace('T', ' ');

    rows.push({
      id: `INS-${String(rows.length + 1).padStart(4, '0')}`,
      timestamp,
      part_name: partName,
      part_code: config.code,
      vendor: pick(VENDORS),
      qty_target: target,
      qty_actual: actual,
      qty_visual: ok ? target : actual + rnd(-1, 1),
      qty_weight: actual,
      weight_grams: weight,
      status: ok ? 'OK' : 'NOT OK',
      proc_time: parseFloat((Math.random() * 1.5 + 1.2).toFixed(2)),
      shift: ts.getHours() < 14 ? 'Pagi' : ts.getHours() < 22 ? 'Siang' : 'Malam',
      source: 'seed'
    });
  }

  return rows;
}

// ══════════════════════════════
// MAIN
// ══════════════════════════════

console.log('');
console.log('🌱 Inspectra Database Seeder');
console.log('══════════════════════════════');

// Check if database already has data
if (dataService.hasData()) {
  console.log('');
  console.log('⚠ Database already contains data!');
  console.log('  To reseed, delete backend/data/inspectra.db and run again.');
  console.log('');
  process.exit(0);
}

// Generate data for the last 14 days
const allRows = [];
const today = new Date();

for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
  const date = new Date(today);
  date.setDate(date.getDate() - daysAgo);
  
  // More data on weekdays, less on weekends
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const count = isWeekend ? rnd(40, 80) : rnd(150, 280);
  
  const rows = generateInspections(date, daysAgo === 0 ? 247 : count);
  
  // Re-assign IDs to be sequential across all days
  rows.forEach(r => {
    r.id = `INS-${String(allRows.length + 1).padStart(4, '0')}`;
    allRows.push(r);
  });
}

console.log(`  Generating ${allRows.length} inspection records...`);

// Bulk insert
try {
  dataService.bulkInsert(allRows);
  console.log(`  ✓ ${allRows.length} inspections inserted.`);
} catch (err) {
  console.error('  ✗ Failed to insert inspections:', err.message);
  process.exit(1);
}

// Add some RPP records
const rppData = [
  { part: 'SCREW-M2×4', vendor: 'Sakura Parts', qty: 3, type: 'Shortage (kurang)' },
  { part: 'GEAR-SP-14T', vendor: 'Mitra Komponen', qty: 1, type: 'Shortage (kurang)' },
  { part: 'HOLDER-BRK', vendor: 'PT. Surya Mas', qty: 2, type: 'Overage (lebih)' },
  { part: 'SCREW-M3×6', vendor: 'Global Parts ID', qty: 5, type: 'Shortage (kurang)' },
];

try {
  for (const rpp of rppData) {
    dataService.addRPP(rpp, 'Seeder');
  }
  console.log(`  ✓ ${rppData.length} RPP reports inserted.`);
} catch (err) {
  console.error('  ✗ Failed to insert RPP:', err.message);
}

// Log seeding event
auditLogger.log('DATABASE_SEEDED', {
  details: {
    inspections: allRows.length,
    rpp_reports: rppData.length,
    date_range: '14 days'
  }
});

// Print summary
const stats = dataService.getStats();
console.log('');
console.log('📊 Database Summary:');
console.log(`   Total inspections today: ${stats.today.total}`);
console.log(`   OK rate:                 ${stats.today.okRate}%`);
console.log(`   NOT OK today:            ${stats.today.totalNG}`);
console.log(`   Avg process time:        ${stats.today.avgProcTime}s`);
console.log('');
console.log('✅ Seeding complete! Start the server with: npm start');
console.log('');

process.exit(0);
