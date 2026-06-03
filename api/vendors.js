const dataService = require('../lib/data-service');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    res.json(await dataService.getVendorStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendor stats' });
  }
};
