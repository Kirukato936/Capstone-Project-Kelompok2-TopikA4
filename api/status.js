const supabase = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { data } = await supabase
      .from('sensor_state')
      .select('value, updated_at')
      .eq('key', 'heartbeat')
      .single();

    const now = new Date();
    const lastSeen = data?.updated_at ? new Date(data.updated_at) : null;
    const diff = lastSeen ? (now - lastSeen) / 1000 : null;
    const isOnline = diff !== null && diff < 60;

    res.json({
      online: isOnline,
      lastSeen: lastSeen,
      serverTime: now,
      database: 'supabase',
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
};
