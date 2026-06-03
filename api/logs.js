/**
 * /api/logs — handles all log endpoints
 * GET /api/logs          → audit logs list
 * GET /api/logs/summary  → ?type=summary
 */
const auditLogger = require('../lib/audit-logger');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (req.query.type === 'summary') {
      return res.json(await auditLogger.getSummary());
    }
    const { action, limit, from, to } = req.query;
    const logs = await auditLogger.getLogs({
      action: action || null,
      limit: parseInt(limit) || 100,
      from: from || null,
      to: to || null,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};
