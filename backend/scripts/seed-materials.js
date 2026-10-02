/**
 * Seed the Material master — matches test-data.md Step 7 (+ Part H4 item type / MOQ / lead days). Idempotent (matched by code).
 *   npm run seed:materials
 * Needs the suppliers from `npm run seed:vendors` (matched by name; a missing supplier just leaves the field blank).
 * Opening stock is posted ONCE as the first ledger row when a material is created; re-runs update the master only, never the balances.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const env = require('../src/config/env');
const Material = require('../src/modules/materials/material.model');
const Supplier = require('../src/modules/suppliers/supplier.model');
const stock = require('../src/modules/stock/stock.service');

const MATERIALS = [
  { code: 'FAB-0121', name: 'Cotton Poplin 60x60 Optical White', category: 'Fabric',    itemType: 'Main fabric (FAB-A)', uom: 'mtr',  rate: 148,  opening: 4000,  reorderLevel: 5000,  godown: 'Rack A', supplier: 'Vardhman Textiles',   spec: '118 gsm, 58" width',  moq: 500,   leadDays: 21 },
  { code: 'FAB-0134', name: 'Rayon 14kg Printed Indigo',          category: 'Fabric',    itemType: 'Main fabric (FAB-A)', uom: 'mtr',  rate: 132,  opening: 2500,  reorderLevel: 3000,  godown: 'Rack B', supplier: 'Shree Rayon Mills',   spec: '14 kg, 44" width',    moq: 500,   leadDays: 18 },
  { code: 'FAB-0155', name: 'Denim 6.5oz Mid Blue',               category: 'Fabric',    itemType: 'Main fabric (FAB-A)', uom: 'mtr',  rate: 210,  opening: 0,     reorderLevel: 2000,  godown: 'Rack C', supplier: 'Vardhman Textiles',   spec: '6.5 oz, 58" width',   moq: 500,   leadDays: 21 },
  { code: 'FAB-0160', name: 'Pocketing Twill White',              category: 'Fabric',    itemType: 'Pocketing',           uom: 'mtr',  rate: 62,   opening: 800,   reorderLevel: 500,   godown: 'Rack C', supplier: 'Vardhman Textiles',   spec: '100% cotton, 36" width', moq: 300, leadDays: 14 },
  { code: 'FAB-0170', name: 'Fusing Interlining Woven White',     category: 'Fabric',    itemType: 'Interlining / fusing', uom: 'mtr', rate: 48,   opening: 600,   reorderLevel: 500,   godown: 'Rack C', supplier: 'Shree Rayon Mills',   spec: '60 gsm, 44" width',   moq: 300,   leadDays: 10 },
  { code: 'ACC-0208', name: 'Poly Button 18L White',              category: 'Accessory', itemType: 'Button',              uom: 'pcs',  rate: 0.8,  opening: 60000, reorderLevel: 50000, godown: 'Bin D',  supplier: 'Kwality Buttons',     spec: '4-hole, 18 ligne',    moq: 20000, leadDays: 5 },
  { code: 'ACC-0214', name: 'Woven Brand Label',                  category: 'Accessory', itemType: 'Main label',          uom: 'pcs',  rate: 2.6,  opening: 15000, reorderLevel: 15000, godown: 'Bin D',  supplier: 'Precision Labels',    spec: '40 × 12 mm',          moq: 5000,  leadDays: 7 },
  { code: 'ACC-0219', name: 'Care & Size Label Set',              category: 'Accessory', itemType: 'Care / wash label',   uom: 'pcs',  rate: 1.4,  opening: 15000, reorderLevel: 15000, godown: 'Bin D',  supplier: 'Precision Labels',    spec: 'printed satin',       moq: 5000,  leadDays: 7 },
  { code: 'ACC-0223', name: 'Hang Tag + String',                  category: 'Accessory', itemType: 'Hang tag',            uom: 'pcs',  rate: 3.1,  opening: 8000,  reorderLevel: 10000, godown: 'Bin E',  supplier: 'Precision Labels',    spec: '300 gsm board',       moq: 5000,  leadDays: 7 },
  { code: 'ACC-0240', name: 'Sewing Thread 40/2 White',           category: 'Accessory', itemType: 'Sewing thread',       uom: 'cone', rate: 95,   opening: 400,   reorderLevel: 300,   godown: 'Bin E',  supplier: 'Kwality Buttons',     spec: '5000 m cone',         moq: 100,   leadDays: 5 },
  { code: 'ACC-0251', name: 'Barcode / JAN Sticker',              category: 'Accessory', itemType: 'Barcode / JAN sticker', uom: 'pcs', rate: 0.35, opening: 20000, reorderLevel: 10000, godown: 'Bin E', supplier: 'Precision Labels',    spec: '40 × 20 mm thermal',  moq: 10000, leadDays: 7 },
  { code: 'PKG-0305', name: 'Poly Bag 12x16 LDPE',                category: 'Packing',   itemType: 'Poly bag',            uom: 'pcs',  rate: 1.2,  opening: 10000, reorderLevel: 20000, godown: 'Yard F', supplier: 'Packwell Industries', spec: '50 micron',           moq: 10000, leadDays: 4 },
  { code: 'PKG-0301', name: 'Export Carton 60x40x40',             category: 'Packing',   itemType: 'Carton',              uom: 'pcs',  rate: 68,   opening: 300,   reorderLevel: 400,   godown: 'Yard F', supplier: 'Packwell Industries', spec: '5-ply, 24 pcs',       moq: 500,   leadDays: 4 },
  { code: 'PKG-0310', name: 'Carton Sticker (shipping mark)',     category: 'Packing',   itemType: 'Carton sticker',      uom: 'pcs',  rate: 0.9,  opening: 1000,  reorderLevel: 500,   godown: 'Yard F', supplier: 'Packwell Industries', spec: 'A5 self-adhesive',    moq: 1000,  leadDays: 4 },
];

(async () => {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const suppliers = await Supplier.find();
  const supplierOf = (name) => suppliers.find((s) => s.name === name);
  let c = 0, u = 0;
  for (const m of MATERIALS) {
    const { opening, supplier, ...rest } = m;
    const sup = supplierOf(supplier);
    const data = { ...rest, supplierId: sup ? sup._id : undefined, supplierName: sup ? sup.name : '' };
    const existing = await Material.findOne({ code: m.code });
    if (existing) { Object.assign(existing, data); await existing.save(); u += 1; console.log(`${m.code.padEnd(10)} ${m.name.padEnd(36)} updated · stock ${existing.physicalQty} ${m.uom}`); continue; }
    const doc = await Material.create(data);
    if (opening > 0) await stock.post({ materialId: doc._id, txn: 'opening', qty: opening, refType: 'adjust', godown: doc.godown, note: 'Opening stock (seed)', by: 'seed' });
    c += 1; console.log(`${m.code.padEnd(10)} ${m.name.padEnd(36)} created · opening ${opening} ${m.uom}${sup ? '' : ' · supplier not found'}`);
  }
  console.log(`\n${c} created · ${u} updated`);
  await mongoose.disconnect();
})().catch((e) => { console.error('seed-materials failed:', e.message); process.exit(1); });
