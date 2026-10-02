/**
 * Seeds the demo dataset (same records as the approved demo) — idempotent.
 * Run: npm run seed
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const User = require('../modules/users/user.model');
const { ROLE_TEMPLATES } = require('../modules/users/roles');
const Buyer = require('../modules/buyers/buyer.model');
const Vendor = require('../modules/vendors/vendor.model');
const Supplier = require('../modules/suppliers/supplier.model');
const Material = require('../modules/materials/material.model');
const Style = require('../modules/styles/style.model');
const Bom = require('../modules/bom/bom.model');
const Sample = require('../modules/samples/sample.model');
const Order = require('../modules/orders/order.model');
const Ledger = require('../modules/stock/ledger.model');
const Po = require('../modules/po/po.model');
const Gate = require('../modules/gate/gate.model');
const JobWork = require('../modules/jobwork/jobwork.model');
const { ProductionOp, ProductionLog } = require('../modules/production/production.model');
const { TnaTemplate, TnaTask } = require('../modules/tna/tna.model');
const tnaSvc = require('../modules/tna/tna.service');
const Pattern = require('../modules/pattern/pattern.model');
const { FabricInspection, InlineInspection, AqlInspection } = require('../modules/quality/quality.model');
const Dispatch = require('../modules/dispatch/dispatch.model');
const Payment = require('../modules/payments/payment.model');
const ComplianceDoc = require('../modules/compliance/compliance.model');
const { nextSeq, pad } = require('../common/utils/counters');
const logger = require('../common/logger/logger');
const log = logger.child({ context: 'Seed' });

const TEAM = [
  { name: 'Vikram Singh',  uid: env.seed.adminUid, role: 'Admin' },
  { name: 'Saurav Mishra', uid: 'saurav',    role: 'Merchandising Head', flags: ['buyer.confidential', 'rates.view'] },
  { name: 'Meena Kapoor',  uid: 'meena',     role: 'Store Manager' },
  { name: 'Amit Prasad',   uid: 'amit',      role: 'Production Manager', flags: ['vendor.confidential'] },
  { name: 'Ravi Kumar',    uid: 'ravi.gate', role: 'Gate Man' },
  { name: 'Sunita Rao',    uid: 'sunita',    role: 'Accounts', flags: ['rates.view', 'reports.financial'] },
  { name: 'Neha Gupta',    uid: 'neha',      role: 'Sampling Incharge', status: 'Invited' },
];

const BUYERS = [
  { brand: 'Zara Home', legalName: 'Inditex S.A.', country: 'Spain', currency: 'EUR', paymentTerms: 'LC 60 days' },
  { brand: 'H&M',       legalName: 'H & M Hennes & Mauritz AB', country: 'Sweden', currency: 'EUR', paymentTerms: 'T/T 30% advance' },
  { brand: 'Primark',   legalName: 'Primark Stores Ltd.', country: 'Ireland', currency: 'GBP', paymentTerms: 'LC at sight' },
  { brand: 'Next',      legalName: 'Next Retail Ltd.', country: 'UK', currency: 'GBP', paymentTerms: 'T/T 30% advance' },
  { brand: 'Decathlon', legalName: 'Decathlon S.A.', country: 'France', currency: 'EUR', paymentTerms: 'LC 90 days' },
  { brand: 'C&A',       legalName: 'C&A Mode GmbH', country: 'Germany', currency: 'EUR', paymentTerms: 'T/T' },
  { brand: 'Tesco F&F', legalName: 'Tesco Stores Ltd.', country: 'UK', currency: 'GBP', paymentTerms: 'T/T 30% + 70%' },
  { brand: 'Mango',     legalName: 'Punto Fa S.L.', country: 'Spain', currency: 'EUR', paymentTerms: 'LC 60 days' },
];

const VENDORS = [
  { name: 'Shakti Dyeing Works',   category: 'Dyeing',     location: 'Panipat',   rate: '₹34 / kg',  onTimePct: 96, rating: 4.8, capacity: '12 T/day' },
  { name: 'Kalpana Printers',      category: 'Printing',   location: 'Noida',     rate: '₹18 / mtr', onTimePct: 91, rating: 4.5, capacity: '8,000 m/day' },
  { name: 'Sri Softex Processors', category: 'Softening',  location: 'Panipat',   rate: '₹9 / kg',   onTimePct: 88, rating: 4.2, capacity: '10 T/day' },
  { name: 'Zaid Embroidery Hub',   category: 'Embroidery', location: 'Noida',     rate: '₹6 / pc',   onTimePct: 94, rating: 4.6, capacity: '6,000 pc/day' },
  { name: 'Precision Cutting Co.', category: 'Cutting',    location: 'Gurugram',  rate: '₹4 / pc',   onTimePct: 99, rating: 4.9, capacity: '15,000 pc/day' },
  { name: 'Anand Stitching Unit',  category: 'Stitching',  location: 'Faridabad', rate: '₹42 / pc',  onTimePct: 87, rating: 4.1, capacity: '5,000 pc/day' },
  { name: 'Perfect Finish Studio', category: 'Finishing',  location: 'Noida',     rate: '₹11 / pc',  onTimePct: 93, rating: 4.4, capacity: '9,000 pc/day' },
  { name: 'Blue Wave Washing',     category: 'Washing',    location: 'Panipat',   rate: '₹26 / pc',  onTimePct: 90, rating: 4.3, capacity: '7,000 pc/day' },
];

const SUPPLIERS = [
  { name: 'Vardhman Textiles',  category: 'Fabric',    location: 'Ludhiana', leadTimeDays: 14 },
  { name: 'Shree Rayon Mills',  category: 'Fabric',    location: 'Surat',    leadTimeDays: 12 },
  { name: 'Arvind Knits',       category: 'Fabric',    location: 'Ahmedabad', leadTimeDays: 15 },
  { name: 'Nandan Denim',       category: 'Fabric',    location: 'Ahmedabad', leadTimeDays: 14 },
  { name: 'Sanghvi Fabrics',    category: 'Fabric',    location: 'Surat',    leadTimeDays: 10 },
  { name: 'Alok Synthetics',    category: 'Fabric',    location: 'Silvassa', leadTimeDays: 12 },
  { name: 'Kohinoor Buttons',   category: 'Accessory', location: 'Delhi',    leadTimeDays: 7 },
  { name: 'Precision Labels',   category: 'Accessory', location: 'Noida',    leadTimeDays: 12 },
  { name: 'Ambika Print',       category: 'Accessory', location: 'Noida',    leadTimeDays: 9 },
  { name: 'Fine Elastics',      category: 'Accessory', location: 'Delhi',    leadTimeDays: 7 },
  { name: 'Coats India',        category: 'Accessory', location: 'Bengaluru', leadTimeDays: 5 },
  { name: 'Gupta Packaging',    category: 'Packing',   location: 'Noida',    leadTimeDays: 5 },
  { name: 'Shakti Poly',        category: 'Packing',   location: 'Ghaziabad', leadTimeDays: 4 },
  { name: 'DryPack Co',         category: 'Packing',   location: 'Delhi',    leadTimeDays: 4 },
];

const MATERIALS = [
  ['FAB-0121', 'Cotton Poplin 60x60 White',   'Fabric',    'mtr', 18400, 12200, 6000, 112, 'Rack A-01', 'Vardhman Textiles'],
  ['FAB-0134', 'Rayon 14kg Printed Indigo',   'Fabric',    'mtr', 9200,  8600,  5000, 148, 'Rack A-04', 'Shree Rayon Mills'],
  ['FAB-0140', 'Single Jersey 160gsm Melange', 'Fabric',   'kg',  2400,  1950,  1500, 395, 'Rack B-02', 'Arvind Knits'],
  ['FAB-0155', 'Denim 6.5oz Raw',             'Fabric',    'mtr', 1150,  1100,  2500, 236, 'Rack B-07', 'Nandan Denim'],
  ['FAB-0162', 'Viscose Crepe Dyeable',       'Fabric',    'mtr', 0,     0,     4000, 164, '—',         'Sanghvi Fabrics'],
  ['FAB-0171', 'Poly Micro Mesh Black',       'Fabric',    'kg',  5600,  2100,  2000, 310, 'Rack C-01', 'Alok Synthetics'],
  ['ACC-0208', 'Poly Button 18L Pearl White',  'Accessory', 'pcs', 186000, 144000, 80000, 1.4, 'Bin D-11', 'Kohinoor Buttons'],
  ['ACC-0214', 'Woven Brand Label',           'Accessory', 'pcs', 14200, 12000, 15000, 2.6, 'Bin D-03', 'Precision Labels'],
  ['ACC-0219', 'Care & Size Label Set',       'Accessory', 'set', 52000, 41000, 25000, 1.9, 'Bin D-05', 'Precision Labels'],
  ['ACC-0223', 'Hang Tag + String (Printed)', 'Accessory', 'pcs', 9800,  12000, 20000, 3.2, 'Bin D-08', 'Ambika Print'],
  ['ACC-0231', 'Elastic Lace 12mm',           'Accessory', 'mtr', 24000, 9000,  10000, 4.5, 'Bin E-02', 'Fine Elastics'],
  ['ACC-0240', 'Sewing Thread 40/2 Tex 27',   'Accessory', 'cone', 1420, 900,   600,   64,  'Bin E-06', 'Coats India'],
  ['PKG-0301', 'Export Carton 5-Ply 60x40x40', 'Packing',  'pcs', 2100,  1650,  1200,  96,  'Yard F-01', 'Gupta Packaging'],
  ['PKG-0305', 'Poly Bag 12x16 (LDPE)',       'Packing',   'pcs', 64000, 52000, 30000, 1.1, 'Yard F-03', 'Shakti Poly'],
  ['PKG-0309', 'BOPP Tape 48mm Printed',      'Packing',   'roll', 180,  240,   250,   52,  'Yard F-04', 'Gupta Packaging'],
  ['PKG-0312', 'Silica Gel Sachet 5g',        'Packing',   'pcs', 38000, 22000, 15000, 0.6, 'Yard F-06', 'DryPack Co'],
];

const STYLES = [
  { styleNo: 'AF-2451', description: 'Men Oxford Shirt Long Sleeve', buyer: 'Zara Home', productType: 'Shirt', fabric: 'Cotton Poplin 60x60', colour: 'Optical White',
    bom: [['FAB-0121', 1.62, 5], ['ACC-0208', 12, 3], ['ACC-0214', 1, 2], ['ACC-0219', 1, 2], ['ACC-0223', 1, 2], ['ACC-0240', 0.06, 4], ['PKG-0305', 1, 2], ['PKG-0301', 0.0333, 1]] },
  { styleNo: 'AF-2447', description: 'Ladies Rayon Printed Top', buyer: 'H&M', productType: 'Top', fabric: 'Rayon 14kg Printed', colour: 'Indigo',
    bom: [['FAB-0134', 1.15, 7], ['ACC-0208', 4, 3], ['ACC-0219', 1, 2], ['ACC-0223', 1, 2], ['ACC-0240', 0.04, 4], ['PKG-0305', 1, 2], ['PKG-0301', 0.025, 1]] },
  { styleNo: 'AF-2436', description: 'Men Denim Shirt Washed', buyer: 'Next', productType: 'Shirt', fabric: 'Denim 6.5oz', colour: 'Mid Blue Wash',
    bom: [['FAB-0155', 1.85, 6], ['ACC-0208', 9, 3], ['ACC-0214', 1, 2], ['ACC-0240', 0.08, 4], ['PKG-0305', 1, 2], ['PKG-0301', 0.0333, 1]] },
  { styleNo: 'AF-2476', description: 'Men Corduroy Overshirt', buyer: 'H&M', productType: 'Overshirt', fabric: 'Cotton Corduroy 8 Wale', colour: 'Camel Brown', bom: [] },
  { styleNo: 'AF-2478', description: 'Ladies Linen Shirt Dress', buyer: 'Mango', productType: 'Dress', fabric: 'Linen 60 Lea', colour: 'Dusty Blue', bom: [] },
  { styleNo: 'AF-2472', description: 'Girls Printed Frock', buyer: 'Primark', productType: 'Frock', fabric: 'Cotton Cambric Printed', colour: 'Pink Floral', bom: [] },
];

const SAMPLES = [
  { styleNo: 'AF-2478', buyer: 'Mango', status: 'Client Review', type: 'Size Set', round: 3, swatch: '#8ba9c9', accessories: 'Shell buttons ×6, woven label, care label, hang tag',
    rounds: [['Round 1 · Proto Sample', 'Proto Sample', 'changes', 'Fit rejected: sleeve length +2cm, collar reshape', '2026-07-12'],
             ['Round 2 · Fit Sample', 'Fit Sample', 'changes', 'Approved fit, colour tone lighter requested', '2026-07-24'],
             ['Round 3 · Size Set (4 pcs)', 'Size Set', 'sent', '', '2026-08-08']] },
  { styleNo: 'AF-2476', buyer: 'H&M', status: 'Approved', type: 'PP Sample', round: 2, swatch: '#d9c7a3', accessories: '12 × Poly Button 18L, woven brand label, care & size label set, printed hang tag + string',
    rounds: [['Round 1 · Proto Sample', 'Proto Sample', 'changes', 'Pocket placement revision', '2026-07-18'],
             ['Round 2 · Fit Sample', 'Fit Sample', 'approved', 'Approved with no comments — PP sample approved 11 Aug', '2026-08-02']] },
  { styleNo: 'AF-2472', buyer: 'Primark', status: 'Revision', type: 'Fit Sample', round: 3, swatch: '#f0b8c8', accessories: 'Care label, size label, hang tag',
    rounds: [['Round 1 · Proto Sample', 'Proto Sample', 'changes', 'Print scale too large', '2026-07-15'],
             ['Round 2 · Revised print', 'Fit Sample', 'changes', 'Buyer asked 3 more colourways', '2026-07-30']] },
  { styleNo: 'AF-2436', buyer: 'Next', status: 'In Sampling', type: 'Proto Sample', round: 1, swatch: '#9fb8a4', accessories: '9 metal buttons, brand label, wash care', rounds: [] },
];

async function main() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const passwordHash = await User.hashPassword(env.seed.adminPassword);

  /* ---- users ---- */
  for (const t of TEAM) {
    if (await User.findOne({ uid: t.uid })) { continue; }
    await User.create({ ...t, modules: ROLE_TEMPLATES[t.role], flags: t.flags || [], passwordHash,
      email: `${t.uid.split('.')[0]}@afionintl.com`, status: t.status || 'Active' });
    log.info(`user · ${t.uid} · ${t.role}`);
  }
  /* saurav gets buyer flag even if he existed before this version */
  for (const t of TEAM.filter((x) => x.flags)) {
    await User.updateOne({ uid: t.uid, $or: [{ flags: { $exists: false } }, { flags: { $size: 0 } }] }, { $set: { flags: t.flags } });
  }

  /* ---- buyers ---- */
  const buyerByBrand = {};
  for (const b of BUYERS) {
    let doc = await Buyer.findOne({ brand: b.brand });
    if (!doc) { doc = await Buyer.create({ ...b, alias: `B-${pad(await nextSeq('buyer'), 2)}` }); log.info(`buyer · ${doc.alias} ${doc.brand}`); }
    buyerByBrand[b.brand] = doc;
  }
  /* ---- vendors ---- */
  for (const v of VENDORS) {
    if (await Vendor.findOne({ name: v.name })) continue;
    const doc = await Vendor.create({ ...v, alias: `V-${pad(await nextSeq('vendor'), 2)}` });
    log.info(`vendor · ${doc.alias} ${doc.name}`);
  }
  /* ---- suppliers ---- */
  const supByName = {};
  for (const s of SUPPLIERS) {
    let doc = await Supplier.findOne({ name: s.name });
    if (!doc) { doc = await Supplier.create(s); log.info(`supplier · ${doc.name}`); }
    supByName[s.name] = doc;
  }
  /* ---- materials ---- */
  const matByCode = {};
  for (const [code, name, category, uom, physicalQty, reservedQty, reorderLevel, rate, godown, sup] of MATERIALS) {
    let doc = await Material.findOne({ code });
    if (!doc) {
      doc = await Material.create({ code, name, category, uom, physicalQty, reservedQty, reorderLevel, rate, godown,
        supplierId: supByName[sup] && supByName[sup]._id, supplierName: sup });
      log.info(`material · ${code}`);
    }
    matByCode[code] = doc;
  }
  /* ---- styles + BOM ---- */
  const styleByNo = {};
  for (const s of STYLES) {
    const b = buyerByBrand[s.buyer];
    let doc = await Style.findOne({ styleNo: s.styleNo });
    if (!doc) {
      doc = await Style.create({ styleNo: s.styleNo, description: s.description, productType: s.productType,
        fabric: s.fabric, colour: s.colour, buyerId: b._id, buyerBrand: b.brand, buyerAlias: b.alias });
      log.info(`style · ${doc.styleNo}`);
    }
    styleByNo[s.styleNo] = doc;
    if (s.bom.length && !(await Bom.findOne({ styleId: doc._id }))) {
      await Bom.create({ styleId: doc._id, styleNo: doc.styleNo, version: 1, updatedBy: 'seed',
        lines: s.bom.map(([code, perPc, wastePct]) => ({ materialId: matByCode[code]._id, materialCode: code,
          materialName: matByCode[code].name, uom: matByCode[code].uom, perPc, wastePct })) });
      log.info(`bom · ${doc.styleNo} (${s.bom.length} lines)`);
    }
  }
  /* ---- samples ---- */
  const sampleByStyle = {};
  for (const s of SAMPLES) {
    const style = styleByNo[s.styleNo], b = buyerByBrand[s.buyer];
    let doc = await Sample.findOne({ styleNo: s.styleNo, buyerId: b._id });
    if (!doc) {
      const rounds = s.rounds.map(([title, type, result, comment, sentOn], i) =>
        ({ no: i + 1, title, type, result, comment, sentOn: new Date(sentOn), by: 'Saurav Mishra' }));
      if (rounds.length < s.round) rounds.push({ no: s.round, title: `Round ${s.round} · ${s.type}`, type: s.type, result: 'pending', by: 'Saurav Mishra' });
      doc = await Sample.create({
        sampleNo: `SMP-${pad(await nextSeq('sample', 318), 3)}`, styleId: style._id, styleNo: style.styleNo,
        description: style.description, buyerId: b._id, buyerBrand: b.brand, buyerAlias: b.alias,
        type: s.type, fabric: style.fabric, colour: style.colour, accessories: s.accessories, status: s.status,
        round: s.round, rounds, swatch: s.swatch, merchandiser: 'Saurav Mishra',
        approvedAt: s.status === 'Approved' ? new Date('2026-08-11') : undefined,
        approvedBy: s.status === 'Approved' ? 'Saurav Mishra' : '',
      });
      log.info(`sample · ${doc.sampleNo} ${doc.styleNo} (${doc.status})`);
    }
    sampleByStyle[s.styleNo] = doc;
  }
  /* ---- one confirmed order from a closed-out sample flow (AF-2451 · Zara Home) ---- */
  if (!(await Order.findOne({ styleNo: 'AF-2451' }))) {
    const style = styleByNo['AF-2451'], b = buyerByBrand['Zara Home'];
    const smp = await Sample.create({
      sampleNo: `SMP-${pad(await nextSeq('sample', 318), 3)}`, styleId: style._id, styleNo: style.styleNo,
      description: style.description, buyerId: b._id, buyerBrand: b.brand, buyerAlias: b.alias, type: 'PP Sample',
      fabric: style.fabric, colour: style.colour, accessories: '12 buttons + 1 label + 1 tag + poly bag per pc',
      status: 'Approved', round: 2, swatch: '#e8e6df', merchandiser: 'Saurav Mishra',
      rounds: [{ no: 1, title: 'Round 1 · Proto Sample', type: 'Proto Sample', result: 'changes', comment: 'Collar stand +0.5cm', sentOn: new Date('2026-07-02'), by: 'Saurav Mishra' },
               { no: 2, title: 'Round 2 · PP Sample', type: 'PP Sample', result: 'approved', comment: 'PP approved', sentOn: new Date('2026-07-15'), by: 'Saurav Mishra' }],
      approvedAt: new Date('2026-07-18'), approvedBy: 'Saurav Mishra',
      specSheets: [{ version: 1, kind: 'generated', fileName: 'Specification-AF-2451-v1.html', by: 'Saurav Mishra' }],
    });
    const qty = 12000, pct = [12, 24, 28, 22, 10, 4];
    const order = await Order.create({
      orderNo: `AFI-${await nextSeq('order', 1042)}`, sampleId: smp._id, sampleNo: smp.sampleNo, sampleRound: 2,
      styleId: style._id, styleNo: style.styleNo, description: style.description,
      buyerId: b._id, buyerBrand: b.brand, buyerAlias: b.alias, buyerPoNo: 'ZH-PO-77120',
      fabric: style.fabric, colour: style.colour, sizeRange: 'S – 3XL', accessories: smp.accessories,
      qty, cutQty: qty, sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'].map((size, i) => ({ size, pct: pct[i], qty: Math.round(qty * pct[i] / 100) })),
      fobRate: 946, shipDate: new Date('2026-09-12'), paymentTerms: 'Letter of Credit (LC) — 60 days', mode: 'Sea',
      priority: 'High', stage: 'Stitching', progress: 62, createdBy: 'seed',
      specSheet: { version: 1, fileName: 'Specification-AF-2451-v1.html', kind: 'generated' },
      activity: [{ by: 'Saurav Mishra', text: 'Order confirmed from SMP-312 · PP sample approved', at: new Date('2026-07-18') },
                 { by: 'Meena Kapoor', text: 'Fabric PO raised to Vardhman · 21,500 mtr', at: new Date('2026-07-21') },
                 { by: 'Amit Prasad', text: 'Cutting completed · 12,000 pcs', at: new Date('2026-08-06') },
                 { by: 'Amit Prasad', text: 'Stitching in progress · Line 3 & 4', at: new Date('2026-08-13') }],
    });
    smp.orderId = order._id; smp.orderNo = order.orderNo; await smp.save();
    log.info(`order · ${order.orderNo} from ${smp.sampleNo}`);
  }

  /* role template grew in P3: production managers also run packing */
  await User.updateMany({ role: 'Production Manager', modules: { $ne: 'packing' } }, { $addToSet: { modules: 'packing' } });

  /* ================= P2 · material truth ================= */
  /* opening ledger rows — Phase 1 balances become the first row of every material's ledger */
  for (const m of await Material.find()) {
    if (await Ledger.exists({ materialId: m._id })) continue;
    await Ledger.create({ materialId: m._id, materialCode: m.code, materialName: m.name, uom: m.uom, txn: 'opening', qty: m.physicalQty,
      balanceAfter: { physical: m.physicalQty, reserved: 0 }, refType: 'adjust', godown: m.godown, note: 'Opening balance at ledger start', by: 'seed' });
    if (m.reservedQty) {
      await Ledger.create({ materialId: m._id, materialCode: m.code, materialName: m.name, uom: m.uom, txn: 'reserve', reservedDelta: m.reservedQty,
        balanceAfter: { physical: m.physicalQty, reserved: m.reservedQty }, refType: 'adjust', godown: m.godown, note: 'Opening reservations (orders before ledger start)', by: 'seed' });
    }
  }
  /* purchase orders + gate receipts (historic receipts are already inside the opening balances) */
  if ((await Po.countDocuments()) === 0) {
    const order = await Order.findOne({ styleNo: 'AF-2451' });
    const mk = async (code, sup, qty, o, extra) => {
      const m = matByCode[code], su = supByName[sup];
      return Po.create({ poNo: `PO-${await nextSeq('po', 2295)}`, supplierId: su._id, supplierName: su.name, materialId: m._id, materialCode: m.code,
        materialName: m.name, category: m.category, uom: m.uom, orderId: o ? o._id : undefined, orderNo: o ? o.orderNo : '',
        orderedQty: qty, rate: m.rate, value: Math.round(qty * m.rate), paymentTerms: su.paymentTerms, createdBy: 'seed',
        approvedBy: 'Vikram Singh', approvedAt: new Date('2026-07-21'), ...extra });
    };
    const receipt = async (po, qty, date, veh, challan, extra = {}) => {
      const prev = po.receivedQty;
      po.receivedQty += qty;
      po.status = po.receivedQty >= po.orderedQty ? 'Fully Received' : 'Partially Received';
      const grnNo = `GRN-${pad(await nextSeq('grn'), 4)}`, gateNo = `GE-${pad(await nextSeq('gate'), 4)}`;
      const g = await Gate.create({ gateNo, grnNo, kind: 'po', refId: po._id, refNo: po.poNo, partyName: po.supplierName, materialId: po.materialId,
        materialCode: po.materialCode, materialName: po.materialName, uom: po.uom, orderId: po.orderId, orderNo: po.orderNo, orderedQty: po.orderedQty,
        previousQty: prev, receivedQty: qty, totalAfter: po.receivedQty, remainingAfter: Math.max(po.orderedQty - po.receivedQty, 0), statusAfter: po.status,
        vehicleNo: veh, driverName: extra.driver || 'Ramesh Yadav', challanNo: challan, invoiceNo: extra.inv || '', date: new Date(date), time: '10:40',
        receivedBy: 'Ravi Kumar', inspection: 'Passed 4-point', godown: extra.godown || '', remarks: 'Seeded historic receipt', by: 'Ravi Kumar' });
      po.receipts.push({ grnNo, gateEntryId: g._id, qty, rejectedQty: 0, challanNo: challan, date: new Date(date), by: 'Ravi Kumar' });
      await po.save();
    };
    const p1 = await mk('FAB-0121', 'Vardhman Textiles', 21500, order, { poDate: new Date('2026-07-21'), eta: new Date('2026-08-04'), status: 'Ordered', priority: 'High', notes: 'Shade lot must match approved swatch' });
    await receipt(p1, 6000, '2026-08-02', 'HR 55 AB 4412', 'VT/DC/2261', { inv: 'VT-INV-8831', godown: 'Rack A-01' });
    await receipt(p1, 6000, '2026-08-09', 'HR 55 AB 4412', 'VT/DC/2284', { inv: 'VT-INV-8902', godown: 'Rack A-01' });
    const p2 = await mk('ACC-0208', 'Kohinoor Buttons', 110000, order, { poDate: new Date('2026-07-24'), eta: new Date('2026-08-12'), status: 'In Transit' });
    await mk('ACC-0223', 'Ambika Print', 40000, order, { poDate: new Date('2026-08-01'), eta: new Date(Date.now() + 4 * 864e5), status: 'Ordered' });
    await mk('FAB-0162', 'Sanghvi Fabrics', 16500, null, { poDate: new Date('2026-08-04'), eta: new Date(Date.now() + 6 * 864e5), status: 'In Transit', priority: 'Urgent', notes: 'Dyeable — deliver directly to Shakti Dye' , deliveryAt: 'Directly to dyeing vendor' });
    const p5 = await mk('PKG-0301', 'Gupta Packaging', 1800, null, { poDate: new Date('2026-07-29'), eta: new Date('2026-08-11'), status: 'Ordered' });
    await receipt(p5, 1000, '2026-08-08', 'UP 16 CT 9021', 'GP/1120', { driver: 'Sunil Kumar', inv: 'GP-4471', godown: 'Yard F-01' });
    await receipt(p5, 800, '2026-08-11', 'UP 16 CT 9021', 'GP/1138', { driver: 'Sunil Kumar', inv: 'GP-4490', godown: 'Yard F-01' });
    log.info(`po · ${[p1, p2, p5].map((x) => x.poNo).join(', ')} + 2 more · gate entries for 4 receipts`);
  }

  /* ================= P3 · outside & floor (AFI-1043) ================= */
  if ((await JobWork.countDocuments()) === 0) {
    const order = await Order.findOne({ styleNo: 'AF-2451' });
    const vByCat = {};
    for (const v of await Vendor.find()) vByCat[v.category] = vByCat[v.category] || v;
    const mkJw = async (cat, op, itemDesc, uom, sentQty, outDate, dueDate, extra = {}) => {
      const v = vByCat[cat];
      return JobWork.create({ challanNo: `JW-${pad(await nextSeq('jw', 774), 4)}`, orderId: order._id, orderNo: order.orderNo, styleNo: order.styleNo,
        vendorId: v._id, vendorAlias: v.alias, vendorName: v.name, process: cat, op, itemDesc, uom, sentQty, rate: extra.rate || 0,
        outDate: new Date(outDate), dueDate: new Date(dueDate), instructions: extra.instructions || '', priority: 'High', createdBy: 'seed' });
    };
    const ret = async (jw, qty, date, veh, vch) => {
      const prev = jw.returnedQty;
      jw.returnedQty += qty;
      jw.status = jw.returnedQty >= jw.sentQty ? 'Received' : 'Partially Received';
      const grnNo = `GRN-${pad(await nextSeq('grn'), 4)}`, gateNo = `GE-${pad(await nextSeq('gate'), 4)}`;
      const g = await Gate.create({ gateNo, grnNo, kind: 'jw', refId: jw._id, refNo: jw.challanNo, partyName: `${jw.vendorAlias} · ${jw.process}`, materialId: jw.materialId,
        materialCode: jw.materialCode, materialName: `${jw.itemDesc} · ${jw.process}`, uom: jw.uom, orderId: jw.orderId, orderNo: jw.orderNo, orderedQty: jw.sentQty,
        previousQty: prev, receivedQty: qty, totalAfter: jw.returnedQty, remainingAfter: Math.max(jw.sentQty - jw.returnedQty, 0), statusAfter: jw.status,
        vehicleNo: veh, driverName: 'Vendor driver', challanNo: vch, date: new Date(date), time: '11:20', receivedBy: 'Ravi Kumar', inspection: 'Passed 4-point',
        remarks: 'Seeded historic return', by: 'Ravi Kumar' });
      jw.returns.push({ grnNo, gateEntryId: g._id, qty, rejectedQty: 0, vendorChallanNo: vch, date: new Date(date), by: 'Ravi Kumar' });
      await jw.save();
      if (jw.op) await ProductionLog.create({ date: new Date(date), orderId: jw.orderId, orderNo: jw.orderNo, op: jw.op, exec: 'Outsourced', where: jw.vendorAlias,
        vendorId: jw.vendorId, vendorName: jw.vendorName, workers: 0, output: qty, rejected: 0, supervisor: `Gate · ${grnNo}`, source: 'gate', grnNo, by: 'Ravi Kumar' });
    };
    const j1 = await mkJw('Dyeing', '', 'Cotton Poplin RFD', 'kg', 6200, '2026-07-26', '2026-08-06', { rate: 34, instructions: 'Optical white — match approved lab dip #3' });
    await ret(j1, 6200, '2026-08-05', 'HR 26 DK 3310', 'SD/CH/771');
    const j2 = await mkJw('Cutting', 'Cutting', 'Cut panels — Men Oxford Shirt', 'pcs', 12000, '2026-08-01', '2026-08-12', { rate: 4, instructions: 'Marker as per size ratio 12/24/28/22/10/4' });
    await ret(j2, 5000, '2026-08-08', 'UP 16 CT 9021', 'PC/1120');
    await ret(j2, 3000, '2026-08-11', 'UP 16 CT 9021', 'PC/1138');
    const j3 = await mkJw('Embroidery', '', 'Front panels — chest logo', 'pcs', 12000, '2026-07-30', '2026-08-08', { rate: 6 });
    await ret(j3, 12000, '2026-08-07', 'DL 8C AE 4471', 'ZE/2209');

    /* production operations + today's floor logs */
    const vCut = vByCat['Cutting'], vFin = vByCat['Finishing'];
    const ops = [
      { op: 'Cutting', exec: 'Outsourced', vendorId: vCut._id, vendorAlias: vCut.alias, vendorName: vCut.name, plannedQty: 12000, doneQty: 8000, jobWorkIds: [j2._id] },
      { op: 'Stitching', exec: 'In-house', line: 'Line 3', plannedQty: 12000, doneQty: 5718 },
      { op: 'Finishing', exec: 'Outsourced', vendorId: vFin._id, vendorAlias: vFin.alias, vendorName: vFin.name, plannedQty: 12000, doneQty: 0 },
      { op: 'Packing', exec: 'In-house', line: 'Packing Hall', plannedQty: 12000, doneQty: 0 },
    ];
    for (const o of ops) await ProductionOp.create({ orderId: order._id, orderNo: order.orderNo, styleNo: order.styleNo, ...o });
    const today = new Date();
    const logs = [
      ['Line 3', 38, 872, 14, 'M. Khan'], ['Line 4', 35, 810, 11, 'M. Khan'],
    ];
    for (const [where, workers, output, rejected, supervisor] of logs) {
      await ProductionLog.create({ date: today, orderId: order._id, orderNo: order.orderNo, op: 'Stitching', exec: 'In-house', where, workers, output, rejected, supervisor, source: 'manual', by: 'Amit Prasad' });
      await ProductionOp.updateOne({ orderId: order._id, op: 'Stitching' }, { $inc: { doneQty: output, rejectedQty: rejected } });
    }
    order.progress = Math.round((8000 + 7400) * 100 / 48000);
    order.stage = 'Stitching'; order.packRatio = 'Solid size, solid colour'; order.pcsPerCarton = 50;
    await order.save();
    log.info(`jobwork · ${[j1, j2, j3].map((j) => j.challanNo).join(', ')} · 4 production ops · 2 floor logs`);
  }

  /* ================= P4 · TNA · pattern · quality ================= */
  await User.updateMany({ role: 'Merchandising Head' }, { $addToSet: { modules: { $each: ['tna', 'pattern'] } } });
  await User.updateMany({ role: 'Production Manager' }, { $addToSet: { modules: { $each: ['quality', 'tna'] } } });
  await User.updateMany({ role: 'Sampling Incharge' }, { $addToSet: { modules: 'pattern' } });
  await User.updateMany({ uid: 'saurav' }, { $addToSet: { flags: 'pattern.approve' } });
  if (!(await TnaTemplate.findOne({ isDefault: true }))) {
    await TnaTemplate.create({ name: 'Standard woven — 60 day', isDefault: true, items: tnaSvc.defaultItems(await tnaSvc.stageNames()), updatedBy: 'seed' });
    log.info('tna template · Standard woven — 60 day (default)');
  }
  for (const o of await Order.find({ status: 'Open' })) {
    if (await TnaTask.exists({ orderId: o._id })) continue;
    await tnaSvc.applyTemplate(null, o);
    await tnaSvc.markEvent(o._id, 'order', o.createdAt, 'seed');
    await tnaSvc.markEvent(o._id, 'pp_sample', o.createdAt, 'seed');
    if (o.specSheet && o.specSheet.fileName) await tnaSvc.markEvent(o._id, 'spec', o.createdAt, 'seed');
    const ops = await ProductionOp.find({ orderId: o._id });
    for (const op of ops) {
      const k = op.op.toLowerCase();
      if (op.doneQty > 0) await tnaSvc.markEvent(o._id, `${k}_start`, new Date('2026-08-06'), 'seed');
      if (op.doneQty >= op.plannedQty && op.plannedQty > 0) await tnaSvc.markEvent(o._id, `${k}_complete`, new Date('2026-08-11'), 'seed');
    }
    if (await JobWork.exists({ orderId: o._id, process: 'Dyeing', status: 'Received' })) await tnaSvc.markEvent(o._id, 'fabric_in', new Date('2026-08-05'), 'seed');
    if (await Po.exists({ orderId: o._id, category: 'Fabric' })) await tnaSvc.markEvent(o._id, 'fabric_po', new Date('2026-07-21'), 'seed');
    log.info(`tna applied · ${o.orderNo}`);
  }
  if ((await Pattern.countDocuments()) === 0) {
    const st1 = styleByNo['AF-2451'], st2 = await Style.findOne({ styleNo: 'AF-2490' });
    const p1 = await Pattern.create({ patternNo: `PT-${pad(await nextSeq('pattern'), 4)}`, styleId: st1._id, styleNo: st1.styleNo, buyerId: st1.buyerId, buyerBrand: st1.buyerBrand, buyerAlias: st1.buyerAlias,
      makerUid: 'neha', makerName: 'Neha Gupta', date: new Date('2026-07-10'), baseSize: 'M', sizeRange: 'S – 3XL', gradingStatus: 'Graded', markerEff: 84.5, status: 'Approved', priority: 'High',
      versions: [{ version: 1, fileName: 'AF-2451-pattern-v1.dxf', kind: 'DXF', note: 'Base pattern from proto', by: 'Neha Gupta', at: new Date('2026-07-10') },
                 { version: 2, fileName: 'AF-2451-pattern-v2.dxf', kind: 'DXF', note: 'Collar stand +0.5 cm as per buyer fit comment', by: 'Neha Gupta', at: new Date('2026-07-16') }],
      issues: [{ version: 2, orderId: (await Order.findOne({ styleNo: 'AF-2451' }))._id, orderNo: 'AFI-1043', issuedTo: 'Precision Cutting Co. (cutting)', by: 'Amit Prasad', at: new Date('2026-08-01') }],
      approvedBy: 'Saurav Mishra', approvedAt: new Date('2026-07-18'), createdBy: 'seed' });
    let p2 = null;
    if (st2) p2 = await Pattern.create({ patternNo: `PT-${pad(await nextSeq('pattern'), 4)}`, styleId: st2._id, styleNo: st2.styleNo, buyerId: st2.buyerId, buyerBrand: st2.buyerBrand, buyerAlias: st2.buyerAlias,
      makerUid: 'neha', makerName: 'Neha Gupta', baseSize: 'M', sizeRange: 'S – 3XL', gradingStatus: 'In progress', markerEff: 0, status: 'In Review', priority: 'High', dueDate: new Date(Date.now() + 3 * 864e5),
      versions: [{ version: 1, fileName: 'AF-2490-kaftan-v1.pdf', kind: 'PDF', note: 'Kaftan block, neckline reduced 1.5 cm', by: 'Neha Gupta' }], reviewNote: 'Please check the neckline against round-2 fit comments', createdBy: 'seed' });
    log.info(`pattern · ${p1.patternNo}${p2 ? ', ' + p2.patternNo : ''}`);
  }
  if ((await InlineInspection.countDocuments()) === 0) {
    const o = await Order.findOne({ styleNo: 'AF-2451' });
    const D = (code, name, severity, count) => ({ code, name, severity, count });
    for (const [line, checked, defects, inspector] of [
      ['Line 3', 420, [D('BS', 'Broken stitch', 'Major', 6), D('UT', 'Untrimmed thread', 'Minor', 9), D('SS', 'Skip stitch', 'Major', 3)], 'QC · Farhan'],
      ['Line 4', 380, [D('OS', 'Open seam', 'Major', 4), D('PK', 'Puckering', 'Minor', 5)], 'QC · Farhan'],
    ]) {
      const total = defects.reduce((a, d) => a + d.count, 0);
      await InlineInspection.create({ date: new Date(), line, orderId: o._id, orderNo: o.orderNo, op: 'Stitching', kind: 'Inline', checked, defects, totalDefects: total, dhu: Math.round(total * 1000 / checked) / 10, inspector, by: 'seed' });
    }
    await AqlInspection.create({ inspNo: `QI-${pad(await nextSeq('aqlInsp'), 4)}`, orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, stage: 'Mid', date: new Date('2026-08-20'), inspector: 'QC · Farhan', merchandiser: 'Saurav Mishra',
      colour: o.colour, sampling: 'Normal', aqlLevel: '2.5', lotSize: 6000, sampleSize: 200, acceptNo: 10, rejectNo: 11, majors: 4, minors: 7,
      defects: [D('MO', 'Measurement out of tolerance', 'Major', 3), D('ST', 'Stain / oil mark', 'Major', 1), D('UT', 'Untrimmed thread', 'Minor', 7)],
      cartonsOpened: 0, cartonsTotal: 0, checks: { colour: 'OK', fabric: 'OK', outlook: 'OK', packaging: 'N/A', pcl: 'N/A', assortment: 'N/A', marking: 'N/A' }, result: 'Pass', by: 'seed' });
    const g = await Gate.findOne({ refNo: 'PO-2296' });
    const m = matByCode['FAB-0121'];
    const meters = 6000, width = 58, pts = 1 * 14 + 2 * 6 + 3 * 2 + 4 * 1;
    await FabricInspection.create({ inspNo: `FI-${pad(await nextSeq('fabricInsp'), 4)}`, gateEntryId: g ? g._id : undefined, grnNo: g ? g.grnNo : '', materialId: m._id, materialCode: m.code, materialName: m.name,
      supplierName: 'Vardhman Textiles', lot: 'VT-LOT-2261', colour: 'Optical White', metersChecked: meters, widthInches: width,
      defects: [{ category: 'Weaving', p1: 8, p2: 3, p3: 1, p4: 0 }, { category: 'Print / dye defect', p1: 4, p2: 2, p3: 1, p4: 0 }, { category: 'Hard stain', p1: 2, p2: 1, p3: 0, p4: 1 }],
      totalPoints: pts, pointsPer100: Math.round(pts * 3937 / (meters * width) * 10) / 10, limit: 20, result: 'Pass', hold: false, inspector: 'QC · Farhan', gsm: '118', date: new Date('2026-08-02'), by: 'seed' });
    log.info('quality · 2 inline inspections · 1 mid AQL · 1 fabric 4-point');
  }

  /* ================= P5 · dispatch · payments · compliance ================= */
  await User.updateMany({ role: 'Accounts' }, { $addToSet: { modules: 'compliance' } });
  await User.updateMany({ uid: 'sunita' }, { $addToSet: { flags: { $each: ['compliance.manage', 'compliance.confidential'] } } });
  if ((await Dispatch.countDocuments()) === 0) {
    const o = await Order.findOne({ styleNo: 'AF-2451' });
    const D = (code, name, severity, count) => ({ code, name, severity, count });
    if (!(await AqlInspection.exists({ orderId: o._id, stage: 'Final' }))) {
      await AqlInspection.create({ inspNo: `QI-${pad(await nextSeq('aqlInsp'), 4)}`, orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, stage: 'Final', date: new Date(Date.now() - 864e5), inspector: 'QC · Farhan', merchandiser: 'Saurav Mishra',
        colour: o.colour, sampling: 'Normal', aqlLevel: '2.5', lotSize: 12000, sampleSize: 315, acceptNo: 14, rejectNo: 15, majors: 6, minors: 11, defects: [D('UT', 'Untrimmed thread', 'Minor', 11), D('MO', 'Measurement out of tolerance', 'Major', 4), D('ST', 'Stain / oil mark', 'Major', 2)],
        cartonsOpened: 24, cartonsTotal: 200, checks: { colour: 'OK', fabric: 'OK', outlook: 'OK', packaging: 'OK', pcl: 'OK', assortment: 'OK', marking: 'OK' }, result: 'Pass', by: 'seed' });
      await tnaSvc.markEvent(o._id, 'final_inspection', new Date(Date.now() - 864e5), 'seed');
    }
    const fy = '2026-27';
    const d = await Dispatch.create({ invoiceNo: `AFI/EXP/${fy}/${pad(await nextSeq('invoice', 182), 4)}`, orderId: o._id, orderNo: o.orderNo, buyerId: o.buyerId, buyerBrand: o.buyerBrand, buyerAlias: o.buyerAlias, buyerPoNo: o.buyerPoNo,
      styleNo: o.styleNo, description: o.description, invoiceDate: new Date(), mode: 'Sea', portOfLoading: 'Nhava Sheva (INNSA1)', portOfDischarge: 'Barcelona (ESBCN)', incoterm: 'FOB', qty: o.qty, cartons: 200, grossWeightKg: 2600, netWeightKg: 2280,
      currency: 'INR', invoiceValue: o.fobRate * o.qty, paymentMethod: 'LC', paymentTerms: o.paymentTerms, transporter: 'Speedway Logistics',
      documents: [{ type: 'Commercial Invoice', status: 'Generated', at: new Date(), by: 'Sunita Rao' }, { type: 'Packing List', status: 'Generated', at: new Date(), by: 'Sunita Rao' }, { type: 'E-Way Bill', status: 'Pending' }, { type: 'Delivery Challan', status: 'Pending' }, { type: 'Certificate of Origin', status: 'Pending' }, { type: 'Bill of Lading', status: 'Pending' }],
      tracking: Dispatch.TRACK.map((t) => ({ ...t, done: false })), createdBy: 'seed' });
    await Payment.create({ dispatchId: d._id, invoiceNo: d.invoiceNo, orderId: o._id, orderNo: o.orderNo, buyerId: o.buyerId, buyerBrand: o.buyerBrand, buyerAlias: o.buyerAlias, invoiceDate: d.invoiceDate, amount: d.invoiceValue, currency: 'INR',
      method: 'LC', bank: 'HSBC EEFC', terms: 'LC 60 days from BL', reference: 'LC-885003', dueDate: new Date(Date.now() + 60 * 864e5),
      milestones: Payment.LC_MILESTONES.map((m) => ({ ...m, done: ['lc_received', 'amendment'].includes(m.key), at: m.key === 'lc_received' ? new Date('2026-07-22') : m.key === 'amendment' ? new Date('2026-08-28') : undefined,
        detail: m.key === 'lc_received' ? 'HSBC · 60 days from BL · ₹1.14 Cr' : m.key === 'amendment' ? 'Latest shipment date extended to 20 Sep' : '' })) });
    log.info(`dispatch · ${d.invoiceNo} (Sea, docs in progress) · payment tracker LC-885003`);
  }
  if ((await ComplianceDoc.countDocuments()) === 0) {
    const day = (n) => new Date(Date.now() + n * 864e5);
    const docs = [
      ['Factory Licence', 'Company licence', 'Directorate of Factories, UP', 'FL/GBN/2019/4471', -325, 40, 'sunita'],
      ['Fire NOC', 'Company licence', 'UP Fire Services', 'FNOC/NOI/2025/0912', -375, -10, 'sunita'],
      ['Consent to Operate (Pollution)', 'Company licence', 'UPPCB', 'CTO/2024/GBN/1187', -165, 200, 'sunita'],
      ['Marine Open Cover Policy', 'Insurance', 'New India Assurance', 'NIA/MOC/26/55821', -353, 12, 'sunita'],
      ['Fire & Burglary Policy', 'Insurance', 'ICICI Lombard', 'ICL/FB/2026/33104', -200, 165, 'sunita'],
      ['SEDEX SMETA 4-pillar', 'Certification', 'Intertek', 'SMETA-2026-IN-7712', -65, 300, 'saurav'],
      ['BSCI Audit Report — Zara Home', 'Buyer audit', 'amfori BSCI', 'BSCI-IN-2026-0412', -90, null, 'saurav'],
      ['IEC Certificate', 'Bank / IEC / GST', 'DGFT', '0512345678', -2200, null, 'sunita'],
      ['Bank Sanction Letter — Packing Credit', 'Bank / IEC / GST', 'HSBC', 'HSBC/PC/2026/117', -30, 90, 'sunita', true],
      ['Format AFN/10 — 4-point fabric inspection', 'Format / Template', 'Afion QA', 'AFN/10', null, null, 'amit'],
      ['Format AFN/21 — Final inspection report', 'Format / Template', 'Afion QA', 'AFN/21', null, null, 'amit'],
    ];
    const users = Object.fromEntries((await User.find()).map((u) => [u.uid, u.name]));
    for (const [title, category, authority, number, issueOff, expOff, uid, conf] of docs) {
      await ComplianceDoc.create({ docNo: `CD-${pad(await nextSeq('compliance'), 4)}`, title, category, authority, number, issueDate: issueOff === null ? undefined : day(issueOff), expiryDate: expOff === null ? undefined : day(expOff),
        ownerUid: uid, ownerName: users[uid] || uid, confidential: !!conf, renewalInProgress: title === 'Fire NOC', notes: title === 'Fire NOC' ? 'Renewal application filed 05 Sep — inspection awaited' : '', createdBy: 'seed' });
    }
    log.info(`compliance · ${docs.length} documents (2 formats, 1 confidential)`);
  }

  /* ================= P6 · buyer tracking portal ================= */
  await User.updateMany({ uid: 'saurav' }, { $addToSet: { flags: 'tna.edit' } });
  const Tracking = require('../modules/portal/tracking.model');
  if ((await Tracking.countDocuments()) === 0) {
    const o = await Order.findOne({ styleNo: 'AF-2451' });
    if (o) {
      await Tracking.create({ token: 'DEMO-2451', kind: 'order', orderId: o._id, orderNo: o.orderNo, buyerId: o.buyerId, buyerAlias: o.buyerAlias, label: 'Demo link', expiresAt: new Date(Date.now() + 365 * 864e5), createdBy: 'seed' });
      log.info('portal · tracking code DEMO-2451 (no PIN) → /track/DEMO-2451');
    }
  }

  log.info(`Done. Login: ${env.seed.adminUid} / ${env.seed.adminPassword}  ·  saurav sees buyers, amit sees vendors (flags)`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { log.error(e.stack || String(e)); process.exit(1); });
