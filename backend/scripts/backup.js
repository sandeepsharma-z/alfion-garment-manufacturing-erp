/**
 * Backup every collection to JSON (no mongodump needed).
 *   node scripts/backup.js            → backups/<timestamp>/<collection>.json  (+ uploads/ copied)
 *   node scripts/backup.js --dir X    → custom output directory
 * Restore with scripts/restore.js.  Runs against MONGODB_URI from .env.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = arg('--dir', path.join(__dirname, '../backups', stamp));

const copyDir = (src, dst) => { if (!fs.existsSync(src)) return 0; fs.mkdirSync(dst, { recursive: true }); let n = 0; for (const f of fs.readdirSync(src)) { const s = path.join(src, f), d = path.join(dst, f); if (fs.statSync(s).isDirectory()) n += copyDir(s, d); else { fs.copyFileSync(s, d); n += 1; } } return n; };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  fs.mkdirSync(out, { recursive: true });
  const cols = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  const manifest = { at: new Date().toISOString(), db: mongoose.connection.name, collections: {} };
  for (const name of cols) {
    const docs = await mongoose.connection.db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(docs, (k, v) => (v && v._bsontype === 'ObjectId' ? { $oid: v.toString() } : v instanceof Date ? { $date: v.toISOString() } : v)));
    manifest.collections[name] = docs.length;
    console.log(`${name.padEnd(22)} ${docs.length}`);
  }
  const files = copyDir(path.join(__dirname, '../uploads'), path.join(out, 'uploads'));
  manifest.uploadedFiles = files;
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nBackup written to ${out} · ${cols.length} collections · ${files} uploaded files`);
  await mongoose.disconnect();
})().catch((e) => { console.error('backup failed:', e.message); process.exit(1); });
