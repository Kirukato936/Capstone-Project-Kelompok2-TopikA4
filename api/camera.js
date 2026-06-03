/**
 * /api/camera — GET + POST camera frame
 * Replaces api/camera/frame.js (mapped via vercel.json rewrite)
 */
const supabase = require('../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { frame, timestamp, fps } = req.body;
    if (!frame || !frame.startsWith('data:image')) {
      return res.status(400).json({ error: 'Invalid frame. Expected base64 image data URI.' });
    }
    try {
      await supabase.from('sensor_state').upsert({ key: 'camera', value: { frame, timestamp: timestamp || new Date().toISOString(), fps: fps || null }, updated_at: new Date().toISOString() });
      await supabase.from('sensor_state').upsert({ key: 'heartbeat', value: { ts: new Date().toISOString() }, updated_at: new Date().toISOString() });
      return res.status(200).json({ message: 'Frame received' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to store frame' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('sensor_state').select('value, updated_at').eq('key', 'camera').single();
      if (error || !data) return res.status(204).end();
      return res.json({ ...data.value, receivedAt: data.updated_at });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch frame' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
