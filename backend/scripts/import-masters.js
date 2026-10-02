/**
 * Data migration of live masters from CSV (go-live, SRS P7).
 *   node scripts/import-masters.js materials  path/to/materials.csv
 *   node scripts/import-masters.js suppliers  path/to/suppliers.csv
 *   node scripts/import-masters.js vendors    path/to/vendors.csv
 *   node scripts/import-masters.js buyers     path/to/buyers.csv
 * Headers are matched case-insensitively; unknown columns are ignored; existing records (by code / name / brand) are updated.
 * Column reference is printed with:  node scripts/import-masters.js --columns
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const COLUMNS = {
  materials: { key: 'code', fields: ['code', 'name', 'category', 'uom', 'rate', 'reorderLevel', 'godown', 'supplierName', 'spec', 'openingQty'] },
  suppliers: { key: 'name', fields: ['name', 'category', 'location', 'gstin', 'paymentTerms', 'leadTimeDays', 'contactName', 'contactPhone', 'contactEmail'] },
  vendors: { key: 'name', fields: ['name', 'category', 'location', 'gstin', 'pan', 'rate', 'capacity', 'onTimePct', 'rating', 'contactName', 'contactPhone'] },
  buyers: { key: 'brand', fields: ['brand', 'legalName', 'country', 'currency', 'paymentTerms', 'address', 'contactName', 'contactRole', 'contactEmail', 'contactPhone', 'notes'] },
};
if (process.argv.includes('--columns')) { Object.entries(COLUMNS).forEach(([k, v]) => console.log(`${k}: ${v.fields.join(', ')}`)); process.exit(0); }
const [kind, file] = process.argv.slice(2);
if (!COLUMNS[kind] || !file || !fs.existsSync(file)) { console.error('usage: node scripts/import-masters.js <materials|suppliers|vendors|buyers> <file.csv>   (or --columns)'); process.exit(1); }

/* tiny CSV parser (quoted fields, commas, CRLF) — no dependency */
const parseCsv = (text) => {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift().map((h) => h.trim().replace(/^﻿/, ''));
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
};
const pick = (row, field) => { const k = Object.keys(row).find((h) => h.replace(/[\s_-]/g, '').toLowerCase() === field.toLowerCase()); return k ? row[k] : undefined; };
const num = (v) => (v === undefined || v === '' ? undefined : +String(v).replace(/[^\d.-]/g, ''));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const Material = require('../src/modules/materials/material.model');
  const Supplier = require('../src/modules/suppliers/supplier.model');
  const Vendor = require('../src/modules/vendors/vendor.model');
  const Buyer = require('../src/modules/buyers/buyer.model');
  const { nextSeq, pad } = require('../src/common/utils/counters');
  const stock = require('../src/modules/stock/stock.service');
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  let created = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const get = (f) => pick(row, f);
    try {
      if (kind === 'materials') {
        const code = String(get('code') || '').toUpperCase(); if (!code) { skipped += 1; continue; }
        const sup = get('supplierName') ? await Supplier.findOne({ name: new RegExp(`^${get('supplierName').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }) : null;
        const data = { name: get('name'), category: get('category') || 'Fabric', uom: get('uom') || 'pcs', rate: num(get('rate')) || 0, reorderLevel: num(get('reorderLevel')) || 0, godown: get('godown') || '', spec: get('spec') || '', supplierId: sup ? sup._id : undefined, supplierName: sup ? sup.name : (get('supplierName') || '') };
        const existing = await Material.findOne({ code });
        if (existing) { Object.assign(existing, data); await existing.save(); updated += 1; }
        else { const m = await Material.create({ code, ...data }); created += 1; const opening = num(get('openingQty')); if (opening > 0) await stock.post({ materialId: m._id, txn: 'opening', qty: opening, refType: 'adjust', godown: m.godown, note: 'Opening stock (CSV import)', by: 'import' }); }
      } else if (kind === 'suppliers') {
        const name = get('name'); if (!name) { skipped += 1; continue; }
        const data = { category: get('category') || 'Fabric', location: get('location') || '', gstin: get('gstin') || '', paymentTerms: get('paymentTerms') || '30 days credit', leadTimeDays: num(get('leadTimeDays')) || 0, contacts: get('contactName') ? [{ name: get('contactName'), phone: get('contactPhone') || '', email: get('contactEmail') || '' }] : [] };
        const r = await Supplier.updateOne({ name }, { $set: data, $setOnInsert: { name } }, { upsert: true }); r.upsertedCount ? created += 1 : updated += 1;
      } else if (kind === 'vendors') {
        const name = get('name'); if (!name) { skipped += 1; continue; }
        const data = { category: get('category') || 'Other', location: get('location') || '', gstin: get('gstin') || '', pan: get('pan') || '', rate: get('rate') || '', capacity: get('capacity') || '', onTimePct: num(get('onTimePct')) || 0, rating: num(get('rating')) || 0, contacts: get('contactName') ? [{ name: get('contactName'), phone: get('contactPhone') || '' }] : [] };
        const existing = await Vendor.findOne({ name });
        if (existing) { Object.assign(existing, data); await existing.save(); updated += 1; } else { await Vendor.create({ name, alias: `V-${pad(await nextSeq('vendor'), 2)}`, ...data }); created += 1; }
      } else if (kind === 'buyers') {
        const brand = get('brand'); if (!brand) { skipped += 1; continue; }
        const data = { legalName: get('legalName') || '', country: get('country') || '', currency: get('currency') || 'USD', paymentTerms: get('paymentTerms') || '', address: get('address') || '', notes: get('notes') || '', contacts: get('contactName') ? [{ name: get('contactName'), role: get('contactRole') || '', email: get('contactEmail') || '', phone: get('contactPhone') || '' }] : [] };
        const existing = await Buyer.findOne({ brand });
        if (existing) { Object.assign(existing, data); await existing.save(); updated += 1; } else { await Buyer.create({ brand, alias: `B-${pad(await nextSeq('buyer'), 2)}`, ...data }); created += 1; }
      }
    } catch (e) { skipped += 1; console.error(`row skipped: ${e.message}`); }
  }
  console.log(`${kind}: ${created} created · ${updated} updated · ${skipped} skipped (of ${rows.length} rows)`);
  await mongoose.disconnect();
})().catch((e) => { console.error('import failed:', e.message); process.exit(1); });
