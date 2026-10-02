/** Module keys mirror the approved demo sidebar + SRS Annex A. */
const MODULES = [
  'dashboard', 'samples', 'orders', 'stock', 'planning', 'po', 'accessory',
  'vendors', 'jobwork', 'production', 'gate', 'packing', 'dispatch',
  'payments', 'reports', 'users', 'settings',
  'tna', 'pattern', 'quality',                       // Phase 4 (SRS M-18 … M-20)
  'compliance',                                      // Phase 5 (SRS M-21)
];

/** Role templates — selecting a role pre-fills module access (SRS FR-17.2). '*' = all. */
const ROLE_TEMPLATES = {
  'Admin':              ['*'],
  'Merchandising Head': ['dashboard', 'samples', 'orders', 'planning', 'reports', 'tna', 'pattern'],
  'Store Manager':      ['dashboard', 'stock', 'po', 'accessory', 'gate'],
  'Production Manager': ['dashboard', 'production', 'jobwork', 'vendors', 'packing', 'quality', 'tna'],
  'Gate Man':           ['gate'],
  'Accounts':           ['dashboard', 'payments', 'dispatch', 'reports', 'compliance'],
  'Sampling Incharge':  ['samples', 'pattern'],
  'Custom':             [],
};

/** Extra permission flags (SRS FR-17.2 / SEC-3). Admin implicitly has all. */
const FLAGS = [
  { key: 'buyer.confidential',  label: 'See buyer identity & commercial terms' },
  { key: 'vendor.confidential', label: 'See vendor identity, rates & bank' },
  { key: 'rates.view',          label: 'See FOB / material rates' },
  { key: 'reports.financial',   label: 'Financial reports' },
  { key: 'po.approve',          label: 'Approve purchase orders above the limit' },
  { key: 'pattern.approve',     label: 'Approve cutting patterns' },
  { key: 'compliance.manage',   label: 'Add / renew compliance documents' },
  { key: 'compliance.confidential', label: 'See confidential compliance documents' },
  { key: 'tna.edit',            label: 'Replan TNA dates and priorities' },
];

const hasModule = (user, key) =>
  Array.isArray(user.modules) && (user.modules[0] === '*' || user.modules.includes(key));

const hasFlag = (user, flag) =>
  !!user && (user.role === 'Admin' || (Array.isArray(user.flags) && user.flags.includes(flag)));

module.exports = { MODULES, ROLE_TEMPLATES, FLAGS, hasModule, hasFlag };
