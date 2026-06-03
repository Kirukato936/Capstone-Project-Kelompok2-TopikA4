/**
 * /api/hardware — handles hardware data ingestion
 * POST /api/hardware/data   → single inspection (default)
 * POST /api/hardware/batch  → ?action=batch
 */
const dataService = require('../lib/data-service');
const auditLogger = require('../lib/audit-logger');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

  // Batch mode
  if (req.query.action === 'batch') {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected { items: [...] }' });
    let saved = 0, errors = 0;
    for (const data of items) {
      try {
        const result = await dataService.addHardwareData(data, clientIP);
        if (result) saved++; else errors++;
      } catch { errors++; }
    }
    console.log(`[Hardware Batch] ✓ ${saved} saved, ${errors} errors`);
    return res.status(201).json({ message: `Batch processed: ${saved} saved, ${errors} errors`, saved, errors });
  }

  // Single inspection
  try {
    const result = await dataService.addHardwareData(req.body, clientIP);
    if (result) {
      await auditLogger.logInspection(
        { id: result.id, part_name: result.part, status: result.status, qty_actual: result.actual, qty_target: result.target, source: 'hardware' },
        clientIP
      );
      console.log(`[Hardware] ✓ ${result.id} | ${result.part} | ${result.actual}/${result.target} | ${result.status}`);
      return res.status(201).json({ message: 'Data received and saved', data: result });
    } else {
      return res.status(400).json({ error: 'Invalid part name. Valid: ' + dataService.getPartNames().join(', ') });
    }
  } catch (err) {
    console.error('[Hardware] ✗', err.message);
    res.status(500).json({ error: 'Failed to save inspection data' });
  }
};
