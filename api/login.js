const auditLogger = require('../lib/audit-logger');


const ACCOUNTS = {
  supervisor: {
    password: 'admin123', name: 'Selena Rafi', role: 'Supervisor QC',
    initials: 'SR', avatarBg: 'var(--blue-600)', access: ['dashboard', 'inspection', 'report'],
    badgeClass: 'role-supervisor', badgeLabel: 'Supervisor QC',
  },
  operator: {
    password: 'op123', name: 'Budi Wicaksono', role: 'Operator QC',
    initials: 'BW', avatarBg: 'var(--green-600)', access: ['dashboard', 'inspection'],
    badgeClass: 'role-operator', badgeLabel: 'Operator QC',
  },
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { role, password } = req.body;
  const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  const account = ACCOUNTS[role];

  if (account && account.password === password) {
    const { password: _, ...safeAccount } = account;
    await auditLogger.logLogin(role, true, clientIP);
    return res.json(safeAccount);
  } else {
    await auditLogger.logLogin(role || 'unknown', false, clientIP);
    return res.status(401).json({ error: 'Role atau Password salah' });
  }
};
