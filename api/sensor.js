/**
 * /api/sensor — GET + POST weight sensor data
 * Replaces api/sensor/weight.js (mapped via vercel.json rewrite)
 */
const supabase = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { weight, stable, timestamp } = req.body;
    if (weight === undefined || typeof weight !== 'number') {
      return res.status(400).json({ error: 'Invalid weight. Expected a number.' });
    }
    try {
      const payload = { weight, stable: stable !== undefined ? stable : true, timestamp: timestamp || new Date().toISOString() };
      await supabase.from('sensor_state').upsert({ key: 'weight', value: payload, updated_at: new Date().toISOString() });
      await supabase.from('sensor_state').upsert({ key: 'heartbeat', value: { ts: new Date().toISOString() }, updated_at: new Date().toISOString() });
      return res.status(200).json({ message: 'Weight data received', data: payload });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to store weight data' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('sensor_state').select('value, updated_at').eq('key', 'weight').single();
      if (error || !data) return res.status(204).end();
      return res.json({ ...data.value, receivedAt: data.updated_at });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch weight data' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
