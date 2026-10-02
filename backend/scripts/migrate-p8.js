/**
 * One-off upgrade for a database created before Phase 8 (client document formats). Safe to re-run.
 *   node scripts/migrate-p8.js
 *   - TNA templates: append the new approval activities (fit sample, size set, lab dip, strike-off, trim card, TOP) where missing,
 *     in the order of the built-in list, so the approvals board can complete them on open orders
 *   - Settings: persist the new defaults (size sets, format numbers, approval items, currency / FX / IGST, cut extra %) so they are editable
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const env = require('../src/config/env');
const { TnaTemplate, ACTIVITIES } = require('../src/modules/tna/tna.model');
const { getCompany } = require('../src/modules/settings/settings.routes');

(async () => {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const templates = await TnaTemplate.find();
  for (const t of templates) {
    const have = new Set(t.items.map((i) => i.key));
    const missing = ACTIVITIES.filter((a) => !have.has(a.key));
    if (!missing.length) { console.log(`${t.name.padEnd(30)} up to date (${t.items.length} activities)`); continue; }
    const merged = [];   // keep the built-in order for new rows, existing rows stay where they are relative to each other
    const byKey = Object.fromEntries(t.items.map((i) => [i.key, i.toObject()]));
    ACTIVITIES.forEach((a) => merged.push(byKey[a.key] || { ...a }));
    t.items.filter((i) => !ACTIVITIES.some((a) => a.key === i.key)).forEach((i) => merged.push(i.toObject()));   // custom activities at the end
    t.items = merged;
    await t.save();
    console.log(`${t.name.padEnd(30)} +${missing.length} activities → ${t.items.length} (${missing.map((m) => m.key).join(', ')})`);
  }
  const s = await getCompany();
  ['sizeSets', 'formatNos', 'approvalItems', 'defaultCurrency', 'fxRate', 'igstPct', 'cutExtraPct'].forEach((k) => s.markModified(k));
  await s.save();
  console.log(`settings                       defaults saved · ${(s.sizeSets || []).length} size sets · currency ${s.defaultCurrency} @ ₹${s.fxRate} · IGST ${s.igstPct}%`);
  await mongoose.disconnect();
})().catch((e) => { console.error('migrate-p8 failed:', e.message); process.exit(1); });
