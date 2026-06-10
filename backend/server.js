/**
 * Inspectra Backend Server
 * 
 * REST API for the Inspectra QC Dashboard.
 * Handles:
 * - Hardware data ingestion (ESP32 → Jetson → HTTP → here)
 * - Dashboard data serving (inspections, stats, charts)
 * - Audit trail / logging
 * - RPP (discrepancy report) management
 * - Authentication (prototype/mock)
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { spawn } = require("child_process");
const dataService = require('./data-service');
let latestWeight = 0;

// Initialize database first (creates tables)
const db = require('./db');
const auditLogger = require('./audit-logger');

const app = express();
const PORT = 3001;

function runYOLO(imagePath) {
  return new Promise((resolve, reject) => {

    const py = spawn(
      "python",
      [
        "detect.py",
        imagePath
      ],
      {
        cwd: __dirname
      }
    );

    let output = "";

    py.stdout.on("data", data => {
      output += data.toString();
    });

    py.stderr.on("data", data => {
      console.error("[YOLO]", data.toString());
    });

    py.on("close", () => {
      try {

        const lines = output.trim().split("\n");
        const jsonLine = lines[lines.length - 1];

        resolve(JSON.parse(jsonLine));

      } catch(err) {
        reject(err);
      }
    });

  });
}

let lastHeartbeat = null;

// In-memory store for real-time camera & weight data
let latestCameraFrame = null;   // { frame: 'data:image/jpeg;base64,...', timestamp, fps }
let latestWeightData = null;    // { weight, stable, timestamp }

app.use(cors());
app.use(bodyParser.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ══════════════════════════════════════════
// AUTHENTICATION (Prototype - Mock Accounts)
// ══════════════════════════════════════════

const ACCOUNTS = {
  supervisor: {
    password: 'admin123',
    name: 'Selena Rafi',
    role: 'Supervisor QC',
    initials: 'SR',
    avatarBg: 'var(--blue-600)',
    access: ['dashboard', 'inspection', 'report'],
    badgeClass: 'role-supervisor',
    badgeLabel: 'Supervisor QC'
  },
  operator: {
    password: 'op123',
    name: 'Budi Wicaksono',
    role: 'Operator QC',
    initials: 'BW',
    avatarBg: 'var(--green-600)',
    access: ['dashboard', 'inspection'],
    badgeClass: 'role-operator',
    badgeLabel: 'Operator QC'
  }
};

app.post('/api/login', (req, res) => {
  const { role, password } = req.body;
  const clientIP = req.ip || req.socket.remoteAddress;

  const account = ACCOUNTS[role];
  if (account && account.password === password) {
    const { password: _, ...safeAccount } = account;
    
    // Log successful login
    auditLogger.logLogin(role, true, clientIP);
    
    res.json(safeAccount);
  } else {
    // Log failed login attempt
    auditLogger.logLogin(role || 'unknown', false, clientIP);
    
    res.status(401).json({ error: 'Role atau Password salah' });
  }
});

// ══════════════════════════════════════════
// INSPECTION DATA ENDPOINTS
// ══════════════════════════════════════════

/**
 * GET /api/inspections
 * Returns all inspection records from database.
 * Frontend uses this to populate the inspection table and live feed.
 */
app.get('/api/inspections', (req, res) => {
  try {
    const data = dataService.getAllData();
    res.json(data);
  } catch (err) {
    console.error('[API] Error fetching inspections:', err.message);
    res.status(500).json({ error: 'Failed to fetch inspections' });
  }
});

/**
 * GET /api/stats
 * Returns computed KPIs from real database data.
 * Used by dashboard KPI cards (total inspections, OK rate, etc.)
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = dataService.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[API] Error fetching stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/stats/trend
 * Returns hourly inspection trend for today.
 * Used by the trend chart on dashboard.
 */
app.get('/api/stats/trend', (req, res) => {
  try {
    res.json(dataService.getHourlyTrend());
  } catch (err) {
    console.error('[API] Error fetching trend:', err.message);
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
});

/**
 * GET /api/stats/defect-trend
 * Returns daily defect rate for the last 14 days.
 */
app.get('/api/stats/defect-trend', (req, res) => {
  try {
    res.json(dataService.getDefectTrend());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch defect trend' });
  }
});

/**
 * GET /api/stats/defect-categories
 * Returns defect breakdown by category.
 */
app.get('/api/stats/defect-categories', (req, res) => {
  try {
    res.json(dataService.getDefectCategories());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch defect categories' });
  }
});

// ══════════════════════════════════════════
// VENDOR & PART ENDPOINTS
// ══════════════════════════════════════════

app.get('/api/vendors', (req, res) => {
  try {
    res.json(dataService.getVendorStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendor stats' });
  }
});

app.get('/api/parts/top', (req, res) => {
  try {
    res.json(dataService.getPartStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch part stats' });
  }
});

// ══════════════════════════════════════════
// RPP (Discrepancy Report) ENDPOINTS
// ══════════════════════════════════════════

app.get('/api/rpp', (req, res) => {
  try {
    res.json(dataService.getRPPData());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch RPP data' });
  }
});

app.post('/api/rpp', (req, res) => {
  try {
    const { part, vendor, qty, type } = req.body;
    const clientIP = req.ip || req.socket.remoteAddress;
    const result = dataService.addRPP({ part, vendor, qty, type }, 'Supervisor', clientIP);
    res.status(201).json(result);
  } catch (err) {
    console.error('[API] Error creating RPP:', err.message);
    res.status(500).json({ error: 'Failed to create RPP' });
  }
});

// ══════════════════════════════════════════
// CAMERA FEED ENDPOINTS
// Jetson pushes JPEG frames as base64, dashboard polls.
// ══════════════════════════════════════════

/**
 * POST /api/camera/frame
 * 
 * Receives a camera frame from the edge device (Jetson/PC).
 * The frame is stored in memory and overwritten on each call.
 * 
 * Expected JSON body:
 * {
 *   "frame": "data:image/jpeg;base64,/9j/...",  // base64 JPEG
 *   "timestamp": "2026-06-03T10:00:00+07:00",   // ISO8601
 *   "fps": 10                                     // optional, for info
 * }
 */
app.post('/api/camera/frame', (req, res) => {
  const { frame, timestamp, fps } = req.body;
  if (!frame || !frame.startsWith('data:image')) {
    return res.status(400).json({ error: 'Invalid frame. Expected base64 image data URI.' });
  }
  lastHeartbeat = new Date();
  latestCameraFrame = {
    frame,
    timestamp: timestamp || new Date().toISOString(),
    fps: fps || null,
    receivedAt: new Date().toISOString()
  };
  res.status(200).json({ message: 'Frame received' });
});

/**
 * GET /api/camera/frame
 * 
 * Returns the latest camera frame stored in memory.
 * Dashboard polls this endpoint every ~500ms.
 */
app.get('/api/camera/frame', (req, res) => {
  if (!latestCameraFrame) {
    return res.status(204).json({ frame: null, message: 'No frame available yet' });
  }
  res.json(latestCameraFrame);
});

// ═══════════════════════════════════════
// CAPTURE INSPECTION
// Dashboard → Save captured image
// ═══════════════════════════════════════

app.post('/api/inspection/capture', async (req, res) => {

  try {

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'No image received'
      });
    }

    const uploadsDir =
      path.join(__dirname, 'uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }

    const filename =
      `capture_${Date.now()}.jpg`;

    const filepath =
      path.join(uploadsDir, filename);

    const base64Data =
      image.replace(
        /^data:image\/\w+;base64,/,
        ''
      );

    fs.writeFileSync(
      filepath,
      base64Data,
      'base64'
    );

    const detection =
      await runYOLO(filepath);

    const WEIGHT_PER_NUT = 0.8;

    const loadQty =
        Math.round(
          latestWeight / WEIGHT_PER_NUT
        );
    
    console.log(
          '[SENSOR FUSION]',
          {
            cvQty: detection.count,
            loadQty: loadQty,
            weight: latestWeight
          }
        );

    const inspection =
      dataService.addHardwareData({
      part: 'SCREW-M2×4',
      actual: detection.count,
      cvQty: detection.count,
      loadQty: loadQty || 0,
      weight: latestWeight || 0,
      procTime: 0.5,
      vendor: 'Sakura Parts'
  });
    
    console.log(
      '[INSPECTION]',
      inspection
    );

    console.log(
      "[YOLO]",
      detection
    );

    console.log(
      '[Capture] Saved:',
      filename
    );

    res.json({
      success: true,
      filename,
      count: detection.count
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});


// ══════════════════════════════════════════
// WEIGHT SENSOR ENDPOINTS
// Jetson/ESP32 pushes live weight readings.
// ══════════════════════════════════════════

/**
 * POST /api/sensor/weight
 * 
 * Receives live weight data from load cell (ESP32 via Jetson).
 * Stored in memory only — not persisted to database.
 * 
 * Expected JSON body:
 * {
 *   "weight": 152.4,     // grams (float)
 *   "stable": true,      // is reading stable?
 *   "timestamp": "..."   // ISO8601
 * }
 */
app.post('/api/sensor/weight', (req, res) => {
  const { weight, stable, timestamp } = req.body;
  if (weight === undefined || typeof weight !== 'number') {
    return res.status(400).json({ error: 'Invalid weight value. Expected a number.' });
  }
  lastHeartbeat = new Date();
  latestWeightData = {
    weight,
    stable: stable !== undefined ? stable : true,
    timestamp: timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString()
  };
  res.status(200).json({ message: 'Weight data received', data: latestWeightData });
});

/**
 * GET /api/sensor/weight
 * 
 * Returns the latest weight reading from load cell.
 * Dashboard polls this endpoint every ~500ms.
 */
app.get('/api/sensor/weight', (req, res) => {
  if (!latestWeightData) {
    return res.status(204).json({ weight: null, message: 'No weight data yet' });
  }
  res.json(latestWeightData);
});

// ══════════════════════════════════════════
// HARDWARE INTEGRATION ENDPOINT
// This is the main data pipeline entry point.
// Jetson/PC sends detection results here.
// ══════════════════════════════════════════

/**
 * POST /api/hardware/data
 * 
 * Receives inspection data from the edge device (Jetson/PC).
 * The Jetson combines:
 *   - Computer Vision results (qty_visual from webcam)
 *   - Load Cell results (qty_weight from ESP32 via Serial)
 * 
 * Expected JSON body:
 * {
 *   "part": "SCREW-M2×4",       // Part name being inspected
 *   "actual": 19,                // Final determined quantity
 *   "weight": 15.8,              // Weight from load cell (grams)
 *   "cvQty": 20,                 // Qty estimated by CV model
 *   "loadQty": 19,               // Qty estimated from weight
 *   "procTime": "1.45",          // Processing time in seconds
 *   "vendor": "Sakura Parts"     // Optional: vendor name
 * }
 * 
 * Response: 201 Created with the saved inspection record
 */
app.post('/api/hardware/data', (req, res) => {
  const data = req.body;
  const clientIP = req.ip || req.socket.remoteAddress;
  lastHeartbeat = new Date();

  try {
    const result = dataService.addHardwareData(data, clientIP);
    if (result) {
      console.log(`[Hardware] ✓ ${result.id} | ${result.part} | Qty: ${result.actual}/${result.target} | ${result.status}`);
      res.status(201).json({ message: 'Data received and saved', data: result });
    } else {
      res.status(400).json({ error: 'Invalid part name. Valid parts: ' + dataService.getPartNames().join(', ') });
    }
  } catch (err) {
    console.error('[Hardware] ✗ Error processing data:', err.message);
    res.status(500).json({ error: 'Failed to save inspection data' });
  }
});

/**
 * POST /api/hardware/batch
 * 
 * Receives buffered data from edge device.
 * Used when the Jetson was offline and accumulated data locally.
 * Accepts an array of inspection objects.
 */
app.post('/api/hardware/batch', (req, res) => {
  const { items } = req.body;
  const clientIP = req.ip || req.socket.remoteAddress;
  lastHeartbeat = new Date();

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Expected { items: [...] }' });
  }

  try {
    const results = [];
    let errors = 0;

    for (const data of items) {
      const result = dataService.addHardwareData(data, clientIP);
      if (result) {
        results.push(result);
      } else {
        errors++;
      }
    }

    console.log(`[Hardware Batch] ✓ ${results.length} saved, ${errors} errors`);
    res.status(201).json({
      message: `Batch processed: ${results.length} saved, ${errors} errors`,
      saved: results.length,
      errors
    });
  } catch (err) {
    console.error('[Hardware Batch] ✗ Error:', err.message);
    res.status(500).json({ error: 'Failed to process batch data' });
  }
});

app.post('/api/sensor/weight', (req, res) => {

  latestWeight = req.body.weight;

  console.log(
    '[LOAD CELL]',
    latestWeight,
    'g'
  );

  res.json({
    success: true
  });

});

// ══════════════════════════════════════════
// AUDIT TRAIL / LOGS ENDPOINT
// ══════════════════════════════════════════

/**
 * GET /api/logs
 * Returns audit trail records.
 * Query params: ?action=INSPECTION_CREATED&limit=50
 */
app.get('/api/logs', (req, res) => {
  try {
    const { action, limit, from, to } = req.query;
    const logs = auditLogger.getLogs({
      action: action || null,
      limit: parseInt(limit) || 100,
      from: from || null,
      to: to || null
    });
    res.json(logs);
  } catch (err) {
    console.error('[API] Error fetching logs:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/logs/summary
 * Returns count of logs grouped by action type.
 */
app.get('/api/logs/summary', (req, res) => {
  try {
    res.json(auditLogger.getSummary());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch log summary' });
  }
});

// ══════════════════════════════════════════
// SYSTEM STATUS
// ══════════════════════════════════════════

app.get('/api/status', (req, res) => {
  const now = new Date();
  const diff = lastHeartbeat ? (now - lastHeartbeat) / 1000 : null;
  const isOnline = diff !== null && diff < 60;

  res.json({
    online: isOnline,
    lastSeen: lastHeartbeat,
    serverTime: now,
    database: 'connected',
    uptime: process.uptime()
  });
});

app.get('/api/sensor/weight', (req, res) => {

  res.json({
    weight: latestWeight
  });

});

// ══════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  // Log server start
  auditLogger.log('SYSTEM_START', { details: { port: PORT } });

  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   INSPECTRA QC Backend Server        ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  Local:   http://localhost:${PORT}      ║`);
  console.log('  ║  Network: http://<YOUR-IP>:3000     ║');
  console.log('  ║  DB:      SQLite (backend/data/)    ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /api/inspections     — All inspection records');
  console.log('    GET  /api/stats           — Dashboard KPIs');
  console.log('    GET  /api/stats/trend     — Hourly trend chart');
  console.log('    GET  /api/vendors         — Vendor performance');
  console.log('    GET  /api/parts/top       — Part distribution');
  console.log('    GET  /api/rpp             — RPP reports');
  console.log('    GET  /api/logs            — Audit trail');
  console.log('    GET  /api/status          — System status');
  console.log('    POST /api/hardware/data   — Single inspection');
  console.log('    POST /api/hardware/batch  — Buffered batch');
  console.log('    POST /api/login           — Authentication');
  console.log('    POST /api/rpp             — Create RPP');
  console.log('    POST /api/camera/frame    — Push camera frame (base64)');
  console.log('    GET  /api/camera/frame    — Latest camera frame');
  console.log('    POST /api/sensor/weight   — Push weight reading');
  console.log('    GET  /api/sensor/weight   — Latest weight reading');
  console.log('');

  // Auto-seed if database is empty
  if (!dataService.hasData()) {
    console.log('  ⚠ Database is empty. Run: node scripts/seed-database.js');
    console.log('');
  } else {
    const stats = dataService.getStats();
    console.log(`  📊 Database: ${stats.today.total} inspections today (${stats.today.okRate}% OK rate)`);
    console.log('');
  }
});
