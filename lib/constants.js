/**
 * Shared constants for Inspectra QC System
 */

const PART_CONFIG = {
  'SCREW-M2×4':  { code: 'SCR-M2X4-001', target: 20, weightPer: 0.8 },
  'GEAR-SP-14T': { code: 'GR-SP14T-002',  target: 50, weightPer: 2.1 },
  'HOLDER-BRK':  { code: 'HLD-BRK-003',   target: 10, weightPer: 4.5 },
  'SCREW-M3×6':  { code: 'SCR-M3X6-004',  target: 30, weightPer: 1.2 },
};

const VENDORS = ['Sakura Parts', 'Mitra Komponen', 'PT. Surya Mas', 'Global Parts ID'];
const PART_NAMES = Object.keys(PART_CONFIG);

module.exports = { PART_CONFIG, VENDORS, PART_NAMES };
