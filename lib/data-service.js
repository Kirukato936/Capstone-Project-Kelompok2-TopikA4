/**
 * Data Service — Inspectra QC (Supabase version)
 * Async replacement for backend/data-service.js
 * All SQLite queries converted to Supabase JS client calls.
 */

const supabase = require('./supabase');
const { PART_CONFIG, VENDORS, PART_NAMES } = require('./constants');

// ── Helpers ────────────────────────────────────────

/** Get WIB (UTC+7) day boundaries as UTC Date objects */
function getWIBDayBoundaries(offsetDays = 0) {
  const now = new Date();
  // Shift to WIB
  const wib = new Date(now.getTime() + 7 * 3600000);
  const dateStr = wib.toISOString().split('T')[0]; // YYYY-MM-DD in WIB

  const dayStart = new Date(`${dateStr}T00:00:00+07:00`);
  const dayEnd   = new Date(`${dateStr}T23:59:59+07:00`);

  if (offsetDays !== 0) {
    dayStart.setDate(dayStart.getDate() + offsetDays);
    dayEnd.setDate(dayEnd.getDate() + offsetDays);
  }
  return { dayStart, dayEnd };
}

function getCurrentShift() {
  const hour = new Date(new Date().getTime() + 7 * 3600000).getUTCHours(); // WIB hour
  if (hour >= 6 && hour < 14) return 'Pagi';
  if (hour >= 14 && hour < 22) return 'Siang';
  return 'Malam';
}

function formatRow(row) {
  const ts = row.timestamp ? new Date(row.timestamp) : null;
  // Format as WIB time string HH:MM:SS
  const tsStr = ts
    ? ts.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' })
    : '';
  return {
    id: row.id,
    ts: row.timestamp,
    tsStr,
    part: row.part_name,
    code: row.part_code,
    vendor: row.vendor,
    target: row.qty_target,
    actual: row.qty_actual,
    weight: row.weight_grams,
    status: row.status,
    cvQty: row.qty_visual,
    loadQty: row.qty_weight,
    procTime: row.proc_time ? String(row.proc_time) : '0.00',
    shift: row.shift,
    source: row.source,
  };
}

async function generateInspectionId() {
  const { count } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true });
  return `INS-${String((count || 0) + 1).padStart(4, '0')}`;
}

async function generateRPPId() {
  const { count } = await supabase
    .from('rpp_reports')
    .select('*', { count: 'exact', head: true });
  const now = new Date(new Date().getTime() + 7 * 3600000);
  const dateStr = `${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return `RPP-${dateStr}-${String((count || 0) + 1).padStart(3, '0')}`;
}

// ── Data Service ────────────────────────────────────────

const dataService = {

  // ── Inspections ──────────────────────────

  async getAllData() {
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || []).map(formatRow);
  },

  async addHardwareData(payload, ip = null) {
    const config = PART_CONFIG[payload.part];
    if (!config) return null;

    const id = await generateInspectionId();
    const actual = payload.actual || 0;
    const target = config.target;
    const status = actual === target ? 'OK' : 'NOT OK';
    const weight = payload.weight || parseFloat((actual * config.weightPer).toFixed(1));
    const cvQty = payload.cvQty !== undefined ? payload.cvQty : (status === 'OK' ? target : actual);
    const loadQty = payload.loadQty !== undefined ? payload.loadQty : actual;
    const procTime = payload.procTime ? parseFloat(payload.procTime) : parseFloat((Math.random() * 1.5 + 1.2).toFixed(2));
    const vendor = payload.vendor || VENDORS[Math.floor(Math.random() * VENDORS.length)];
    const shift = getCurrentShift();

    const row = {
      id,
      part_name: payload.part,
      part_code: config.code,
      vendor,
      qty_target: target,
      qty_actual: actual,
      qty_visual: cvQty,
      qty_weight: loadQty,
      weight_grams: weight,
      status,
      proc_time: procTime,
      shift,
      source: 'hardware',
    };

    const { error } = await supabase.from('inspections').insert(row);
    if (error) throw error;

    // Update heartbeat
    await supabase.from('sensor_state').upsert({ key: 'heartbeat', value: { ts: new Date().toISOString(), ip }, updated_at: new Date().toISOString() });

    return formatRow({ ...row, timestamp: new Date().toISOString() });
  },

  async bulkInsert(rows) {
    // Insert in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from('inspections').insert(chunk);
      if (error) throw error;
    }
  },

  async hasData() {
    const { count } = await supabase.from('inspections').select('*', { count: 'exact', head: true });
    return (count || 0) > 0;
  },

  // ── Statistics ───────────────────────────

  async getStats() {
    const { dayStart, dayEnd } = getWIBDayBoundaries(0);
    const { dayStart: yStart, dayEnd: yEnd } = getWIBDayBoundaries(-1);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);

    const [todayRes, yRes, ngRes] = await Promise.all([
      supabase.from('inspections').select('status, proc_time').gte('timestamp', dayStart.toISOString()).lte('timestamp', dayEnd.toISOString()),
      supabase.from('inspections').select('status').gte('timestamp', yStart.toISOString()).lte('timestamp', yEnd.toISOString()),
      supabase.from('inspections').select('id').eq('status', 'NOT OK').gte('timestamp', thirtyMinAgo.toISOString()),
    ]);

    const today = todayRes.data || [];
    const yData = yRes.data || [];

    const total = today.length;
    const totalOK = today.filter(r => r.status === 'OK').length;
    const totalNG = total - totalOK;
    const okRate = total > 0 ? parseFloat((totalOK / total * 100).toFixed(1)) : 0;
    const avgProcTime = total > 0
      ? parseFloat((today.reduce((s, r) => s + (r.proc_time || 0), 0) / total).toFixed(2))
      : 0;

    const yTotal = yData.length;
    const yOK = yData.filter(r => r.status === 'OK').length;
    const yNG = yTotal - yOK;
    const yOKRate = yTotal > 0 ? parseFloat((yOK / yTotal * 100).toFixed(1)) : 0;

    return {
      today: { total, totalOK, totalNG, okRate, avgProcTime },
      comparison: {
        totalDiff: yTotal > 0 ? Math.round((total - yTotal) / yTotal * 100) : 0,
        okRateDiff: parseFloat((okRate - yOKRate).toFixed(1)),
        ngDiff: totalNG - yNG,
      },
      recentNGCount: ngRes.data?.length || 0,
    };
  },

  async getHourlyTrend() {
    const { dayStart, dayEnd } = getWIBDayBoundaries(0);
    const { data, error } = await supabase
      .from('inspections')
      .select('timestamp, status')
      .gte('timestamp', dayStart.toISOString())
      .lte('timestamp', dayEnd.toISOString());
    if (error) throw error;

    const hourMap = {};
    for (const row of (data || [])) {
      const hour = new Date(new Date(row.timestamp).getTime() + 7 * 3600000).getUTCHours();
      const key = `${String(hour).padStart(2, '0')}:00`;
      if (!hourMap[key]) hourMap[key] = { hour: key, ok_count: 0, ng_count: 0 };
      if (row.status === 'OK') hourMap[key].ok_count++;
      else hourMap[key].ng_count++;
    }
    return Object.values(hourMap).sort((a, b) => a.hour.localeCompare(b.hour));
  },

  async getVendorStats() {
    const { data, error } = await supabase.from('inspections').select('vendor, status');
    if (error) throw error;

    const map = {};
    for (const r of (data || [])) {
      if (!map[r.vendor]) map[r.vendor] = { name: r.vendor, total: 0, ng: 0 };
      map[r.vendor].total++;
      if (r.status === 'NOT OK') map[r.vendor].ng++;
    }
    return Object.values(map).map(v => ({
      ...v,
      rate: v.total > 0 ? parseFloat((v.ng / v.total * 100).toFixed(1)) : 0,
    })).sort((a, b) => a.rate - b.rate);
  },

  async getPartStats() {
    const { data, error } = await supabase.from('inspections').select('part_name');
    if (error) throw error;

    const map = {};
    for (const r of (data || [])) {
      map[r.part_name] = (map[r.part_name] || 0) + 1;
    }
    const total = (data || []).length;
    return Object.entries(map)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? Math.round(count / total * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  },

  async getDefectTrend() {
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('inspections')
      .select('timestamp, status')
      .gte('timestamp', cutoff);
    if (error) throw error;

    const map = {};
    for (const r of (data || [])) {
      const wibDate = new Date(new Date(r.timestamp).getTime() + 7 * 3600000);
      const key = wibDate.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!map[key]) map[key] = { dt: key, total: 0, ng: 0 };
      map[key].total++;
      if (r.status === 'NOT OK') map[key].ng++;
    }
    return Object.values(map)
      .map(d => {
        const [year, month, day] = d.dt.split('-');
        return {
          day_label: `${day} ${month}`,
          dt: d.dt,
          defect_rate: d.total > 0 ? parseFloat((d.ng / d.total * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => a.dt.localeCompare(b.dt));
  },

  async getDefectCategories() {
    const { data, error } = await supabase
      .from('inspections')
      .select('qty_actual, qty_target')
      .eq('status', 'NOT OK');
    if (error) throw error;

    const cats = { 'Kuantitas kurang': 0, 'Kuantitas lebih': 0, 'Lainnya': 0 };
    for (const r of (data || [])) {
      if (r.qty_actual < r.qty_target) cats['Kuantitas kurang']++;
      else if (r.qty_actual > r.qty_target) cats['Kuantitas lebih']++;
      else cats['Lainnya']++;
    }
    return Object.entries(cats)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  },

  // ── RPP ─────────────────────────────────

  async getRPPData() {
    const { data, error } = await supabase.from('rpp_reports').select('*').order('timestamp', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, part: r.part_name, vendor: r.vendor,
      selisih: r.selisih, status: r.status, timestamp: r.timestamp,
    }));
  },

  async addRPP({ part, vendor, qty, type }, actor = 'SYSTEM', ip = null) {
    const id = await generateRPPId();
    const sign = type.includes('kurang') ? '-' : '+';
    const selisih = `${sign}${qty} pcs`;

    const { error } = await supabase.from('rpp_reports').insert({ id, part_name: part, vendor, selisih, created_by: actor });
    if (error) throw error;

    return { id, part_name: part, vendor, selisih, status: 'open' };
  },

  // ── Utilities ───────────────────────────

  getPartConfig: () => PART_CONFIG,
  getPartNames:  () => PART_NAMES,
  getVendors:    () => VENDORS,
};

module.exports = dataService;
