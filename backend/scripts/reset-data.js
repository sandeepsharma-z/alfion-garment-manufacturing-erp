/**
 * Wipe working data so the team can enter everything by hand, keeping only what is needed to log in and operate:
 *   kept   → settings (company, form fields, pipeline stages), TNA templates, the Admin user(s), files referenced by settings (letterhead)
 *   wiped  → buyers, vendors, suppliers, materials, styles, BOMs, samples, orders, POs, gate entries, stock ledger, job work, production,
 *            patterns, quality, alerts, audit log, dispatch, payments, compliance, tracking codes, other users, uploaded files, counters
 * Usage:  node scripts/reset-data.js --yes            (refuses without --yes; run scripts/backup.js first)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

if (!process.argv.includes('--yes')) { console.error(`This will DELETE all working data in ${process.env.MONGODB_URI.replace(/\/\/.*@/, '//***@')}. Re-run with --yes.`); process.exit(1); }
const KEEP = new Set(['settings', 'tnatemplates']);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const settings = await db.collection('settings').findOne({ key: 'company' });
  const keepFiles = new Set([settings && settings.letterheadFileId && String(settings.letterheadFileId)].filter(Boolean));
  const cols = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  for (const name of cols) {
    if (KEEP.has(name)) { console.log(`${name.padEnd(20)} kept`); continue; }
    if (name === 'users') { const r = await db.collection(name).deleteMany({ role: { $ne: 'Admin' } }); console.log(`${name.padEnd(20)} ${r.deletedCount} removed (Admin kept)`); continue; }
    if (name === 'files') {
      const docs = await db.collection(name).find({}).toArray();
      let disk = 0;
      for (const f of docs) { if (keepFiles.has(String(f._id))) continue; const p = path.join(__dirname, '../uploads', f.storageKey || ''); if (f.storageKey && fs.existsSync(p)) { fs.unlinkSync(p); disk += 1; } }
      const r = await db.collection(name).deleteMany({ _id: { $nin: [...keepFiles].map((id) => new mongoose.Types.ObjectId(id)) } });
      console.log(`${name.padEnd(20)} ${r.deletedCount} removed (${disk} files deleted from uploads/)`); continue;
    }
    const r = await db.collection(name).deleteMany({});
    console.log(`${name.padEnd(20)} ${r.deletedCount} removed`);
  }
  await db.collection('settings').updateOne({ key: 'company' }, { $set: { tnaStages: require('../src/modules/tna/tna.model').DEFAULT_STAGES } });
  console.log('\nDone. Log in as the Admin user; numbering restarts from the first number of each series.');
  await mongoose.disconnect();
})().catch((e) => { console.error('reset failed:', e.message); process.exit(1); });
