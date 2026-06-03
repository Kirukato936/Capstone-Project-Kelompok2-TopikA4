/**
 * API Test Script for Inspectra Backend
 * Tests all major endpoints.
 * 
 * Usage: node test-api.js
 * (Make sure the server is running first: npm start)
 */

const http = require('http');

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost', port: 3001, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n🧪 Inspectra API Tests\n');
  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  await test('GET /api/status', async () => {
    const r = await request('/api/status');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!r.body.serverTime) throw new Error('Missing serverTime');
  });

  await test('POST /api/login (correct)', async () => {
    const r = await request('/api/login', 'POST', { role: 'supervisor', password: 'admin123' });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (r.body.name !== 'Selena Rafi') throw new Error('Wrong user');
  });

  await test('POST /api/login (wrong password)', async () => {
    const r = await request('/api/login', 'POST', { role: 'supervisor', password: 'wrong' });
    if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
  });

  await test('GET /api/inspections', async () => {
    const r = await request('/api/inspections');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!Array.isArray(r.body)) throw new Error('Expected array');
  });

  await test('GET /api/stats', async () => {
    const r = await request('/api/stats');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (r.body.today === undefined) throw new Error('Missing today stats');
  });

  await test('GET /api/stats/trend', async () => {
    const r = await request('/api/stats/trend');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
  });

  await test('GET /api/vendors', async () => {
    const r = await request('/api/vendors');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
  });

  await test('GET /api/parts/top', async () => {
    const r = await request('/api/parts/top');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
  });

  await test('POST /api/hardware/data', async () => {
    const r = await request('/api/hardware/data', 'POST', {
      part: 'SCREW-M2×4', actual: 20, weight: 16.0, cvQty: 20, loadQty: 20, procTime: '1.35'
    });
    if (r.status !== 201) throw new Error(`Status ${r.status}`);
    if (r.body.data.status !== 'OK') throw new Error('Expected OK status');
  });

  await test('POST /api/hardware/data (NOT OK)', async () => {
    const r = await request('/api/hardware/data', 'POST', {
      part: 'SCREW-M2×4', actual: 17, weight: 13.6, cvQty: 18, loadQty: 17
    });
    if (r.status !== 201) throw new Error(`Status ${r.status}`);
    if (r.body.data.status !== 'NOT OK') throw new Error('Expected NOT OK');
  });

  await test('GET /api/logs', async () => {
    const r = await request('/api/logs?limit=5');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!Array.isArray(r.body)) throw new Error('Expected array');
  });

  await test('GET /api/rpp', async () => {
    const r = await request('/api/rpp');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
  });

  await test('POST /api/rpp', async () => {
    const r = await request('/api/rpp', 'POST', {
      part: 'SCREW-M2×4', vendor: 'Sakura Parts', qty: 2, type: 'Shortage (kurang)'
    });
    if (r.status !== 201) throw new Error(`Status ${r.status}`);
  });

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('Test runner error:', err); process.exit(1); });
