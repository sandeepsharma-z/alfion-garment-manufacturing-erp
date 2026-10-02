/**
 * Restore a backup made by scripts/backup.js into MONGODB_URI (drops each collection first).
 *   node scripts/restore.js --dir backups/2026-09-11T07-00-00 [--yes]
 * Refuses to run without --yes because it overwrites live data.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const dir = arg('--dir');
if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('usage: node scripts/restore.js --dir <backup folder> --yes'); process.exit(1); }
if (!process.argv.includes('--yes')) { console.error(`This will REPLACE the data in ${process.env.MONGODB_URI.replace(/\/\/.*@/, '//***@')}. Re-run with --yes to confirm.`); process.exit(1); }

const revive = (k, v) => (v && typeof v === 'object' && '$oid' in v ? new mongoose.Types.ObjectId(v.$oid) : v && typeof v === 'object' && '$date' in v ? new Date(v.$date) : v);
const copyDir = (src, dst) => { if (!fs.existsSync(src)) return 0; fs.mkdirSync(dst, { recursive: true }); let n = 0; for (const f of fs.readdirSync(src)) { const s = path.join(src, f), d = path.join(dst, f); if (fs.statSync(s).isDirectory()) n += copyDir(s, d); else { fs.copyFileSync(s, d); n += 1; } } return n; };

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  for (const name of Object.keys(manifest.collections)) {
    const docs = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'), revive);
    const col = mongoose.connection.db.collection(name);
    await col.drop().catch(() => undefined);
    if (docs.length) await col.insertMany(docs);
    console.log(`${name.padEnd(22)} ${docs.length}`);
  }
  const files = copyDir(path.join(dir, 'uploads'), path.join(__dirname, '../uploads'));
  console.log(`\nRestored ${Object.keys(manifest.collections).length} collections from ${manifest.at} · ${files} files`);
  await mongoose.disconnect();
})().catch((e) => { console.error('restore failed:', e.message); process.exit(1); });
