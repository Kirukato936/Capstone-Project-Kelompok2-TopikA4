/**
 * Audit Logger for Inspectra QC System
 * Records every significant event for traceability and compliance.
 * 
 * Events tracked:
 * - INSPECTION_CREATED: New inspection data received from hardware
 * - LOGIN_SUCCESS / LOGIN_FAILED: Authentication attempts
 * - RPP_CREATED: New discrepancy report generated
 * - SYSTEM_START: Server startup
 * - DATA_EXPORT: CSV/data export by user
 */

const db = require('./db');

// Prepared statements for performance
const insertLog = db.prepare(`
  INSERT INTO audit_logs (action, actor, details, ip_address)
  VALUES (?, ?, ?, ?)
`);

const queryLogs = db.prepare(`
  SELECT * FROM audit_logs
  ORDER BY timestamp DESC
  LIMIT ?
`);

const queryLogsByAction = db.prepare(`
  SELECT * FROM audit_logs
  WHERE action = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

const queryLogsByDateRange = db.prepare(`
  SELECT * FROM audit_logs
  WHERE timestamp BETWEEN ? AND ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

const countByAction = db.prepare(`
  SELECT action, COUNT(*) as count
  FROM audit_logs
  GROUP BY action
  ORDER BY count DESC
`);

const auditLogger = {
  /**
   * Log an event to the audit trail
   * @param {string} action - Event type (e.g. 'INSPECTION_CREATED')
   * @param {object} options - { actor, details, ip }
   */
  log(action, { actor = 'SYSTEM', details = null, ip = null } = {}) {
    try {
      const detailsStr = details ? JSON.stringify(details) : null;
      insertLog.run(action, actor, detailsStr, ip);
    } catch (err) {
      console.error('[AuditLogger] Failed to write log:', err.message);
    }
  },

  /**
   * Log a new inspection event
   */
  logInspection(inspectionData, ip = null) {
    this.log('INSPECTION_CREATED', {
      details: {
        id: inspectionData.id,
        part: inspectionData.part_name,
        status: inspectionData.status,
        qty_actual: inspectionData.qty_actual,
        qty_target: inspectionData.qty_target,
        source: inspectionData.source || 'hardware'
      },
      ip
    });
  },

  /**
   * Log a login attempt
   */
  logLogin(role, success, ip = null) {
    this.log(success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED', {
      actor: role,
      details: { role, success },
      ip
    });
  },

  /**
   * Log RPP creation
   */
  logRPP(rppData, actor = 'SYSTEM', ip = null) {
    this.log('RPP_CREATED', {
      actor,
      details: {
        id: rppData.id,
        part: rppData.part_name,
        vendor: rppData.vendor,
        selisih: rppData.selisih
      },
      ip
    });
  },

  /**
   * Get recent logs with optional filtering
   * @param {object} filter - { action, limit, from, to }
   */
  getLogs({ action = null, limit = 100, from = null, to = null } = {}) {
    try {
      let rows;
      if (from && to) {
        rows = queryLogsByDateRange.all(from, to, limit);
      } else if (action) {
        rows = queryLogsByAction.all(action, limit);
      } else {
        rows = queryLogs.all(limit);
      }

      // Parse details JSON back to object
      return rows.map(row => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : null
      }));
    } catch (err) {
      console.error('[AuditLogger] Failed to query logs:', err.message);
      return [];
    }
  },

  /**
   * Get summary count of logs by action type
   */
  getSummary() {
    try {
      return countByAction.all();
    } catch (err) {
      console.error('[AuditLogger] Failed to get summary:', err.message);
      return [];
    }
  }
};

module.exports = auditLogger;
