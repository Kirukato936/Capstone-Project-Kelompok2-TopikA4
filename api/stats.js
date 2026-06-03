/**
 * /api/stats — handles all stats endpoints
 * Routes via ?type= query param (mapped by vercel.json rewrites)
 * GET /api/stats                    → main KPI stats
 * GET /api/stats/trend              → ?type=trend
 * GET /api/stats/defect-trend       → ?type=defect-trend
 * GET /api/stats/defect-categories  → ?type=defect-categories
 */
const dataService = require('../lib/data-service');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const type = req.query.type;
    if (type === 'trend')               return res.json(await dataService.getHourlyTrend());
    if (type === 'defect-trend')        return res.json(await dataService.getDefectTrend());
    if (type === 'defect-categories')   return res.json(await dataService.getDefectCategories());
    return res.json(await dataService.getStats());
  } catch (err) {
    console.error('[API] stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
