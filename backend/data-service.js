/**
 * Data Service for Inspectra QC System
 * Handles all database operations for inspections, RPP reports, and statistics.
 * 
 * Upgraded from in-memory arrays to SQLite persistence.
 * Every query hits the real database — data survives server restarts.
 */

const db = require('./db');
const auditLogger = require('./audit-logger');

// ══════════════════════════════
// CONSTANTS
// ══════════════════════════════

const PART_CONFIG = {
  'SCREW-M2×4':  { code: 'SCR-M2X4-001', target: 20, weightPer: 0.8 },
  'GEAR-SP-14T': { code: 'GR-SP14T-002',  target: 50, weightPer: 2.1 },
  'HOLDER-BRK':  { code: 'HLD-BRK-003',   target: 10, weightPer: 4.5 },
  'SCREW-M3×6':  { code: 'SCR-M3X6-004',  target: 30, weightPer: 1.2 },
};

const VENDORS = ['Sakura Parts', 'Mitra Komponen', 'PT. Surya Mas', 'Global Parts ID'];
const PART_NAMES = Object.keys(PART_CONFIG);

// ══════════════════════════════
// PREPARED STATEMENTS
// ══════════════════════════════

const stmts = {
  // Inspections
  insertInspection: db.prepare(`
    INSERT INTO inspections (id, timestamp, part_name, part_code, vendor, qty_target, qty_actual, qty_visual, qty_weight, weight_grams, status, proc_time, shift, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getAllInspections: db.prepare(`
    SELECT * FROM inspections ORDER BY timestamp DESC
  `),

  getInspectionsLimit: db.prepare(`
    SELECT * FROM inspections ORDER BY timestamp DESC LIMIT ?
  `),

  getInspectionById: db.prepare(`
    SELECT * FROM inspections WHERE id = ?
  `),

  getInspectionCount: db.prepare(`
    SELECT COUNT(*) as total FROM inspections
  `),

  // Stats
  getTodayStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) as total_ok,
      SUM(CASE WHEN status = 'NOT OK' THEN 1 ELSE 0 END) as total_ng,
      ROUND(AVG(proc_time), 2) as avg_proc_time,
      ROUND(100.0 * SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as ok_rate
    FROM inspections
    WHERE date(timestamp) = date('now', 'localtime')
  `),

  getYesterdayStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) as total_ok,
      SUM(CASE WHEN status = 'NOT OK' THEN 1 ELSE 0 END) as total_ng,
      ROUND(100.0 * SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as ok_rate
    FROM inspections
    WHERE date(timestamp) = date('now', 'localtime', '-1 day')
  `),

  // Hourly trend for today
  getHourlyTrend: db.prepare(`
    SELECT 
      strftime('%H:00', timestamp) as hour,
      SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) as ok_count,
      SUM(CASE WHEN status = 'NOT OK' THEN 1 ELSE 0 END) as ng_count
    FROM inspections
    WHERE date(timestamp) = date('now', 'localtime')
    GROUP BY strftime('%H', timestamp)
    ORDER BY hour
  `),

  // Vendor stats
  getVendorStats: db.prepare(`
    SELECT 
      vendor as name,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'NOT OK' THEN 1 ELSE 0 END) as ng,
      ROUND(100.0 * SUM(CASE WHEN status = 'NOT OK' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as rate
    FROM inspections
    GROUP BY vendor
    ORDER BY rate ASC
  `),

  // Part distribution
  getPartStats: db.prepare(`
    SELECT 
      part_name as name,
      COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / (SELECT MAX(COUNT(*), 1) FROM inspections), 0) as pct
    FROM inspections
    GROUP BY part_name
    ORDER BY count DESC
  `),

  // Recent NOT OK
  getRecentNG: db.prepare(`
    SELECT * FROM inspections 
    WHERE status = 'NOT OK' 
    ORDER BY timestamp DESC 
    LIMIT ?
  `),

  // Recent NOT OK count (last 30 minutes)
  getRecentNGCount: db.prepare(`
    SELECT COUNT(*) as count FROM inspections
    WHERE status = 'NOT OK' 
    AND timestamp >= datetime('now', 'localtime', '-30 minutes')
  `),

  // RPP
  insertRPP: db.prepare(`
    INSERT INTO rpp_reports (id, part_name, vendor, selisih, status, created_by)
    VALUES (?, ?, ?, ?, 'open', ?)
  `),

  getAllRPP: db.prepare(`
    SELECT * FROM rpp_reports ORDER BY timestamp DESC
  `),

  getRPPCount: db.prepare(`
    SELECT COUNT(*) as total FROM rpp_reports
  `),

  // Defect rate per day (last 14 days)
  getDefectTrend: db.prepare(`
    SELECT 
      strftime('%d %m', timestamp) as day_label,
      date(timestamp) as dt,
      ROUND(100.0 * SUM(CASE WHEN status = 'NOT OK' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as defect_rate
    FROM inspections
    WHERE date(timestamp) >= date('now', 'localtime', '-14 days')
    GROUP BY date(timestamp)
    ORDER BY dt
  `),

  // Defect categories (simulated from data patterns)
  getDefectCategories: db.prepare(`
    SELECT 
      CASE 
        WHEN qty_actual < qty_target THEN 'Kuantitas kurang'
        WHEN qty_actual > qty_target THEN 'Kuantitas lebih'
        ELSE 'Lainnya'
      END as category,
      COUNT(*) as count
    FROM inspections
    WHERE status = 'NOT OK'
    GROUP BY category
    ORDER BY count DESC
  `),
};

// ══════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════

function generateInspectionId() {
  const count = stmts.getInspectionCount.get().total;
  return `INS-${String(count + 1).padStart(4, '0')}`;
}

function generateRPPId() {
  const count = stmts.getRPPCount.get().total;
  const now = new Date();
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `RPP-${dateStr}-${String(count + 1).padStart(3, '0')}`;
}

function getCurrentShift() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Pagi';
  if (hour >= 14 && hour < 22) return 'Siang';
  return 'Malam';
}

function formatRow(row) {
  return {
    id: row.id,
    ts: row.timestamp,
    tsStr: row.timestamp ? row.timestamp.split(' ')[1] || row.timestamp.slice(11, 19) : '',
    part: row.part_name,
    code: row.part_code,
    vendor: row.vendor,
    target: row.qty_target,
    actual: row.qty_actual,
    weight: row.weight_grams,
    status: row.status,
    cvQty: row.qty_visual,
    loadQty: row.qty_weight,
    procTime: row.proc_time ? String(row.proc_time) : '0.00',
    shift: row.shift,
    source: row.source
  };
}

// ══════════════════════════════
// DATA SERVICE (exported)
// ══════════════════════════════

const dataService = {
  // ── Inspections ──────────────

  getAllData() {
    const rows = stmts.getAllInspections.all();
    return rows.map(formatRow);
  },

  getInspection(id) {
    const row = stmts.getInspectionById.get(id);
    return row ? formatRow(row) : null;
  },

  /**
   * Add inspection data from hardware (ESP32 → Jetson → HTTP → here)
   * This is the main data pipeline entry point.
   * 
   * Expected payload from Jetson:
   * {
   *   part: "SCREW-M2×4",
   *   actual: 19,           // qty detected
   *   weight: 15.8,         // grams from load cell
   *   cvQty: 20,            // qty from computer vision
   *   loadQty: 19,          // qty estimated from weight
   *   procTime: "1.45",     // processing time in seconds
   *   vendor: "Sakura Parts" // optional
   * }
   */
  addHardwareData(data, ip = null) {
    const config = PART_CONFIG[data.part];
    if (!config) return null;

    const id = generateInspectionId();
    
    // Gunakan waktu lokal (WIB) bukan UTC
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(now.getTime() - tzoffset)).toISOString().slice(0, 19).replace('T', ' ');
    const timestamp = localISOTime;

    const actual = data.actual || 0;
    const target = config.target;
    const status = actual === target ? 'OK' : 'NOT OK';
    const weight = data.weight || parseFloat((actual * config.weightPer).toFixed(1));
    const cvQty = data.cvQty !== undefined ? data.cvQty : (status === 'OK' ? target : actual);
    const loadQty = data.loadQty !== undefined ? data.loadQty : actual;
    const procTime = data.procTime ? parseFloat(data.procTime) : parseFloat((Math.random() * 1.5 + 1.2).toFixed(2));
    const vendor = data.vendor || VENDORS[Math.floor(Math.random() * VENDORS.length)];
    const shift = getCurrentShift();

    const inspectionData = {
      id, timestamp,
      part_name: data.part,
      part_code: config.code,
      vendor, 
      qty_target: target,
      qty_actual: actual,
      qty_visual: cvQty,
      qty_weight: loadQty,
      weight_grams: weight,
      status,
      proc_time: procTime,
      shift,
      source: 'hardware'
    };

    // Insert into database
    stmts.insertInspection.run(
      id, timestamp, data.part, config.code, vendor,
      target, actual, cvQty, loadQty, weight,
      status, procTime, shift, 'hardware'
    );

    // Log to audit trail
    auditLogger.logInspection(inspectionData, ip);

    return formatRow(inspectionData);
  },

  // ── Statistics ──────────────

  getStats() {
    const today = stmts.getTodayStats.get();
    const yesterday = stmts.getYesterdayStats.get();
    const recentNG = stmts.getRecentNGCount.get();

    // Calculate comparison percentages
    const totalDiff = yesterday.total > 0 
      ? Math.round((today.total - yesterday.total) / yesterday.total * 100) 
      : 0;
    const okRateDiff = yesterday.ok_rate 
      ? parseFloat((today.ok_rate - yesterday.ok_rate).toFixed(1))
      : 0;
    const ngDiff = today.total_ng - (yesterday.total_ng || 0);

    return {
      today: {
        total: today.total || 0,
        totalOK: today.total_ok || 0,
        totalNG: today.total_ng || 0,
        okRate: today.ok_rate || 0,
        avgProcTime: today.avg_proc_time || 0
      },
      comparison: {
        totalDiff,    // e.g. +12 (%)
        okRateDiff,   // e.g. +1.2
        ngDiff        // e.g. +3
      },
      recentNGCount: recentNG.count || 0
    };
  },

  getHourlyTrend() {
    return stmts.getHourlyTrend.all();
  },

  getVendorStats() {
    return stmts.getVendorStats.all();
  },

  getPartStats() {
    return stmts.getPartStats.all();
  },

  getDefectTrend() {
    return stmts.getDefectTrend.all();
  },

  getDefectCategories() {
    return stmts.getDefectCategories.all();
  },

  // ── RPP Reports ──────────────

  getRPPData() {
    const rows = stmts.getAllRPP.all();
    return rows.map(r => ({
      id: r.id,
      part: r.part_name,
      vendor: r.vendor,
      selisih: r.selisih,
      status: r.status,
      timestamp: r.timestamp
    }));
  },

  addRPP({ part, vendor, qty, type }, actor = 'SYSTEM', ip = null) {
    const id = generateRPPId();
    const sign = type.includes('kurang') ? '-' : '+';
    const selisih = `${sign}${qty} pcs`;

    stmts.insertRPP.run(id, part, vendor, selisih, actor);

    const rppData = { id, part_name: part, vendor, selisih, status: 'open' };
    auditLogger.logRPP(rppData, actor, ip);

    return rppData;
  },

  // ── Utilities ──────────────

  getPartConfig() {
    return PART_CONFIG;
  },

  getPartNames() {
    return PART_NAMES;
  },

  getVendors() {
    return VENDORS;
  },

  /**
   * Bulk insert inspections (used by seed script)
   */
  bulkInsert(rows) {
    const insert = db.transaction((items) => {
      for (const r of items) {
        stmts.insertInspection.run(
          r.id, r.timestamp, r.part_name, r.part_code, r.vendor,
          r.qty_target, r.qty_actual, r.qty_visual, r.qty_weight, r.weight_grams,
          r.status, r.proc_time, r.shift, r.source
        );
      }
    });
    insert(rows);
  },

  /**
   * Check if database has any inspection data
   */
  hasData() {
    return stmts.getInspectionCount.get().total > 0;
  }
};

module.exports = dataService;
