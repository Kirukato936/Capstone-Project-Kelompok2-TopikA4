const dataService = require('../lib/data-service');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const data = await dataService.getAllData();
    res.json(data);
  } catch (err) {
    console.error('[API] inspections error:', err.message);
    res.status(500).json({ error: 'Failed to fetch inspections' });
  }
};
