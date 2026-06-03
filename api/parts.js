/**
 * /api/parts — GET top parts
 * Replaces api/parts/top.js (mapped via vercel.json rewrite)
 */
const dataService = require('../lib/data-service');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    res.json(await dataService.getPartStats());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch part stats' });
  }
};
