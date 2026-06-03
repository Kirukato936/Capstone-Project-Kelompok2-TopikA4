/**
 * Seed Script for Inspectra — Supabase version
 * Generates ~250 inspection records across the last 14 days.
 * Run: node scripts/seed-supabase.js
 */
require('dotenv').config();

const dataService = require('../lib/data-service');
const auditLogger = require('../lib/audit-logger');
const { PART_CONFIG, PART_NAMES, VENDORS } = require('../lib/constants');

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateInspections(date, count, startId) {
  const rows = [];
  const base = new Date(date);
  base.setHours(7, 0, 0, 0);
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const ts = new Date(base.getTime() + i * 180000);
    if (date.toDateString() === now.toDateString() && ts > now) break;

    const partName = pick(PART_NAMES);
    const config = PART_CONFIG[partName];
    const ok = Math.random() > 0.035;
    const actual = ok ? config.target : config.target + (Math.random() < 0.5 ? -rnd(1, 3) : rnd(1, 2));
    const weight = parseFloat((actual * config.weightPer + rnd(0, 3) * 0.1).toFixed(1));

    rows.push({
      id: `INS-${String(startId + rows.length).padStart(4, '0')}`,
      timestamp: ts.toISOString(),
      part_name: partName,
      part_code: config.code,
      vendor: pick(VENDORS),
      qty_target: config.target,
      qty_actual: actual,
      qty_visual: ok ? config.target : actual + rnd(-1, 1),
      qty_weight: actual,
      weight_grams: weight,
      status: ok ? 'OK' : 'NOT OK',
      proc_time: parseFloat((Math.random() * 1.5 + 1.2).toFixed(2)),
      shift: ts.getHours() < 14 ? 'Pagi' : ts.getHours() < 22 ? 'Siang' : 'Malam',
      source: 'seed',
    });
  }
  return rows;
}

async function main() {
  console.log('\n🌱 Inspectra Supabase Seeder');
  console.log('══════════════════════════════');

  const hasData = await dataService.hasData();
  if (hasData) {
    console.log('\n⚠ Database sudah punya data! Hapus dulu dari Supabase table jika ingin re-seed.\n');
    process.exit(0);
  }

  const allRows = [];
  const today = new Date();

  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const count = daysAgo === 0 ? 247 : (isWeekend ? rnd(40, 80) : rnd(150, 280));
    const rows = generateInspections(date, count, allRows.length + 1);
    allRows.push(...rows);
  }

  console.log(`  Memasukkan ${allRows.length} rekord inspeksi...`);
  try {
    await dataService.bulkInsert(allRows);
    console.log(`  ✓ ${allRows.length} inspections berhasil dimasukkan.`);
  } catch (err) {
    console.error('  ✗ Gagal insert inspections:', err.message);
    process.exit(1);
  }

  // RPP data
  const rppList = [
    { part: 'SCREW-M2×4', vendor: 'Sakura Parts', qty: 3, type: 'Shortage (kurang)' },
    { part: 'GEAR-SP-14T', vendor: 'Mitra Komponen', qty: 1, type: 'Shortage (kurang)' },
    { part: 'HOLDER-BRK', vendor: 'PT. Surya Mas', qty: 2, type: 'Overage (lebih)' },
    { part: 'SCREW-M3×6', vendor: 'Global Parts ID', qty: 5, type: 'Shortage (kurang)' },
  ];
  for (const rpp of rppList) await dataService.addRPP(rpp, 'Seeder');
  console.log(`  ✓ ${rppList.length} RPP reports berhasil dimasukkan.`);

  await auditLogger.log('DATABASE_SEEDED', { details: { inspections: allRows.length, rpp: rppList.length } });

  const stats = await dataService.getStats();
  console.log('\n📊 Ringkasan:');
  console.log(`   Total inspeksi hari ini: ${stats.today.total}`);
  console.log(`   OK rate: ${stats.today.okRate}%`);
  console.log(`   NOT OK hari ini: ${stats.today.totalNG}`);
  console.log('\n✅ Seeding selesai! Deploy ke Vercel dan buka dashboard.\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
