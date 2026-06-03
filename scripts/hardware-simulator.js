/**
 * Hardware Simulator for Inspectra QC System
 * 
 * Simulates the Jetson/PC sending inspection data to the backend API.
 * Mimics the real data pipeline:
 *   ESP32 (load cell) → Serial → Jetson (CV + fusion) → HTTP → Backend
 * 
 * Usage:
 *   node scripts/hardware-simulator.js              # default: 1 inspection every 5s
 *   node scripts/hardware-simulator.js --fast        # 1 every 2s
 *   node scripts/hardware-simulator.js --burst 10    # send 10 at once, then stop
 * 
 * Great for:
 *   - Testing dashboard real-time updates
 *   - Demo to dosen without physical hardware
 *   - Validating audit trail logging
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3001;
const API_PATH = '/api/hardware/data';

const PARTS = ['SCREW-M2×4', 'GEAR-SP-14T', 'HOLDER-BRK', 'SCREW-M3×6'];
const TARGETS = { 'SCREW-M2×4': 20, 'GEAR-SP-14T': 50, 'HOLDER-BRK': 10, 'SCREW-M3×6': 30 };
const WEIGHT_PER = { 'SCREW-M2×4': 0.8, 'GEAR-SP-14T': 2.1, 'HOLDER-BRK': 4.5, 'SCREW-M3×6': 1.2 };
const VENDORS = ['Sakura Parts', 'Mitra Komponen', 'PT. Surya Mas', 'Global Parts ID'];

function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Generate a realistic inspection payload
 * Simulates what the Jetson would send after processing CV + load cell data
 */
function generatePayload() {
  const part = pick(PARTS);
  const target = TARGETS[part];
  const wPer = WEIGHT_PER[part];

  // Set defect rate to 20% for testing (was 5%)
  const ok = Math.random() > 0.20;
  const actual = ok ? target : target + (Math.random() < 0.6 ? -rnd(1, 3) : rnd(1, 2));

  // CV might have slight variance
  const cvQty = ok ? target : actual + rnd(-1, 1);
  
  // Load cell qty from weight
  const loadQty = actual;
  const weight = parseFloat((actual * wPer + (Math.random() - 0.5) * 0.3).toFixed(1));
  
  // Processing time (CV inference + fusion)
  const procTime = (Math.random() * 1.5 + 1.0).toFixed(2);

  return {
    part,
    actual,
    weight,
    cvQty,
    loadQty,
    procTime,
    vendor: pick(VENDORS)
  };
}

/**
 * Send data to the backend API
 */
function sendData(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

// ══════════════════════════════
// MAIN
// ══════════════════════════════

const args = process.argv.slice(2);
const isFast = args.includes('--fast');
const burstIndex = args.indexOf('--burst');
const burstCount = burstIndex !== -1 ? parseInt(args[burstIndex + 1]) || 10 : 0;

console.log('');
console.log('  🔧 Inspectra Hardware Simulator');
console.log('  ════════════════════════════════');
console.log(`  Target: http://${API_HOST}:${API_PORT}${API_PATH}`);
console.log(`  Mode:   ${burstCount > 0 ? `Burst (${burstCount} items)` : `Continuous (every ${isFast ? '2' : '5'}s)`}`);
console.log('  Press Ctrl+C to stop');
console.log('');

let count = 0;

async function sendOne() {
  const payload = generatePayload();
  count++;

  try {
    const result = await sendData(payload);
    const d = result.body.data || {};
    const statusIcon = d.status === 'OK' ? '✅' : '❌';
    console.log(`  [${String(count).padStart(3, '0')}] ${statusIcon} ${d.id || '???'} | ${payload.part.padEnd(12)} | Qty: ${payload.actual}/${TARGETS[payload.part]} | ${payload.weight}g | ${d.status || 'ERR'}`);
  } catch (err) {
    console.log(`  [${String(count).padStart(3, '0')}] ⚠ Connection failed: ${err.message}`);
    console.log('       Is the server running? (npm start)');
  }
}

if (burstCount > 0) {
  // Burst mode: send N items rapidly
  (async () => {
    console.log(`  Sending ${burstCount} inspections...`);
    console.log('');
    
    for (let i = 0; i < burstCount; i++) {
      await sendOne();
    }
    
    console.log('');
    console.log(`  ✓ Burst complete. ${burstCount} inspections sent.`);
    process.exit(0);
  })();
} else {
  // Continuous mode: send every N seconds
  const interval = isFast ? 2000 : 5000;
  
  sendOne(); // Send first one immediately
  setInterval(sendOne, interval);
}
