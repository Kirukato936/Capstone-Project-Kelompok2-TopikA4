/**
 * Audit Logger — Inspectra QC (Supabase version)
 * Async replacement for backend/audit-logger.js
 */

const supabase = require('./supabase');

const auditLogger = {
  async log(action, { actor = 'SYSTEM', details = null, ip = null } = {}) {
    try {
      await supabase.from('audit_logs').insert({ action, actor, details, ip_address: ip });
    } catch (err) {
      console.error('[AuditLogger] Failed to write log:', err.message);
    }
  },

  async logInspection(inspectionData, ip = null) {
    await this.log('INSPECTION_CREATED', {
      details: {
        id: inspectionData.id, part: inspectionData.part_name,
        status: inspectionData.status, qty_actual: inspectionData.qty_actual,
        qty_target: inspectionData.qty_target, source: inspectionData.source || 'hardware',
      },
      ip,
    });
  },

  async logLogin(role, success, ip = null) {
    await this.log(success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED', {
      actor: role, details: { role, success }, ip,
    });
  },

  async logRPP(rppData, actor = 'SYSTEM', ip = null) {
    await this.log('RPP_CREATED', {
      actor,
      details: { id: rppData.id, part: rppData.part_name, vendor: rppData.vendor, selisih: rppData.selisih },
      ip,
    });
  },

  async getLogs({ action = null, limit = 100, from = null, to = null } = {}) {
    try {
      let query = supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
      if (action) query = query.eq('action', action);
      if (from) query = query.gte('timestamp', from);
      if (to) query = query.lte('timestamp', to);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[AuditLogger] Failed to query logs:', err.message);
      return [];
    }
  },

  async getSummary() {
    try {
      const { data, error } = await supabase.from('audit_logs').select('action');
      if (error) throw error;
      const map = {};
      for (const r of (data || [])) map[r.action] = (map[r.action] || 0) + 1;
      return Object.entries(map).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count);
    } catch (err) {
      console.error('[AuditLogger] Failed to get summary:', err.message);
      return [];
    }
  },
};

module.exports = auditLogger;
