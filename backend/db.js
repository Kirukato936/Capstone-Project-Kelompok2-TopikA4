/**
 * Database Module for Inspectra QC System
 * Uses SQLite (better-sqlite3) for zero-config persistence.
 * 
 * Database file: backend/data/inspectra.db
 * Auto-creates tables on first run.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'inspectra.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ══════════════════════════════
// SCHEMA CREATION
// ══════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS inspections (
    id            TEXT PRIMARY KEY,
    timestamp     DATETIME DEFAULT (datetime('now', 'localtime')),
    part_name     TEXT NOT NULL,
    part_code     TEXT NOT NULL,
    vendor        TEXT NOT NULL,
    qty_target    INTEGER NOT NULL,
    qty_actual    INTEGER NOT NULL,
    qty_visual    INTEGER,
    qty_weight    INTEGER,
    weight_grams  REAL,
    status        TEXT NOT NULL CHECK (status IN ('OK', 'NOT OK')),
    proc_time     REAL,
    shift         TEXT DEFAULT 'Pagi',
    source        TEXT DEFAULT 'hardware'
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     DATETIME DEFAULT (datetime('now', 'localtime')),
    action        TEXT NOT NULL,
    actor         TEXT DEFAULT 'SYSTEM',
    details       TEXT,
    ip_address    TEXT
  );

  CREATE TABLE IF NOT EXISTS rpp_reports (
    id            TEXT PRIMARY KEY,
    timestamp     DATETIME DEFAULT (datetime('now', 'localtime')),
    part_name     TEXT NOT NULL,
    vendor        TEXT NOT NULL,
    selisih       TEXT NOT NULL,
    status        TEXT DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'closed')),
    created_by    TEXT DEFAULT 'SYSTEM'
  );

  -- Index for common queries
  CREATE INDEX IF NOT EXISTS idx_inspections_timestamp ON inspections(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
  CREATE INDEX IF NOT EXISTS idx_inspections_vendor ON inspections(vendor);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
`);

console.log(`[DB] SQLite database ready at: ${dbPath}`);

module.exports = db;
