/**
 * Seed ONLY the team (users + roles + permission flags) — matches test-data.md Step 4. Safe on a clean database and idempotent.
 *   npm run seed:users          (password for everyone = SEED_ADMIN_PASSWORD from .env, default Afion@123)
 * Existing users are left as they are, except their role's modules and the flags listed here are ensured.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const env = require('../src/config/env');
const User = require('../src/modules/users/user.model');
const { ROLE_TEMPLATES } = require('../src/modules/users/roles');

const TEAM = [
  { name: 'Vikram Singh',  uid: env.seed.adminUid, role: 'Admin',              phone: '+91 98100 00000', flags: [] },
  { name: 'Saurav Mishra', uid: 'saurav',    role: 'Merchandising Head', phone: '+91 98100 00001', flags: ['buyer.confidential', 'rates.view', 'pattern.approve', 'tna.edit'] },
  { name: 'Neha Gupta',    uid: 'neha',      role: 'Sampling Incharge',  phone: '+91 98100 00002', flags: [] },
  { name: 'Meena Kapoor',  uid: 'meena',     role: 'Store Manager',      phone: '+91 98100 00003', flags: [] },
  { name: 'Ravi Kumar',    uid: 'ravi.gate', role: 'Gate Man',           phone: '+91 98100 00004', flags: [] },
  { name: 'Amit Prasad',   uid: 'amit',      role: 'Production Manager', phone: '+91 98100 00005', flags: ['vendor.confidential'] },
  { name: 'Sunita Rao',    uid: 'sunita',    role: 'Accounts',           phone: '+91 98100 00006', flags: ['rates.view', 'reports.financial', 'compliance.manage', 'compliance.confidential'] },
];

(async () => {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const passwordHash = await User.hashPassword(env.seed.adminPassword);
  let created = 0, updated = 0;
  for (const t of TEAM) {
    const modules = ROLE_TEMPLATES[t.role];
    const existing = await User.findOne({ uid: t.uid });
    if (existing) {
      existing.role = t.role; existing.modules = modules; existing.flags = [...new Set([...(existing.flags || []), ...t.flags])];
      if (!existing.phone) existing.phone = t.phone;
      await existing.save(); updated += 1;
      console.log(`${t.uid.padEnd(10)} ${t.role.padEnd(20)} updated · flags: ${existing.flags.join(', ') || '—'}`);
    } else {
      await User.create({ name: t.name, uid: t.uid, role: t.role, modules, flags: t.flags, phone: t.phone, email: `${t.uid.split('.')[0]}@afionintl.com`, status: 'Active', passwordHash, mustChangePassword: false });
      created += 1;
      console.log(`${t.uid.padEnd(10)} ${t.role.padEnd(20)} created · flags: ${t.flags.join(', ') || '—'}`);
    }
  }
  console.log(`\n${created} created · ${updated} updated · password for all: ${env.seed.adminPassword}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('seed-users failed:', e.message); process.exit(1); });
