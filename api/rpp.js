const dataService = require('../lib/data-service');
const auditLogger = require('../lib/audit-logger');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      res.json(await dataService.getRPPData());
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch RPP data' });
    }

  } else if (req.method === 'POST') {
    try {
      const { part, vendor, qty, type } = req.body;
      const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
      const result = await dataService.addRPP({ part, vendor, qty, type }, 'Supervisor', clientIP);
      await auditLogger.logRPP(result, 'Supervisor', clientIP);
      res.status(201).json(result);
    } catch (err) {
      console.error('[API] RPP error:', err.message);
      res.status(500).json({ error: 'Failed to create RPP' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
