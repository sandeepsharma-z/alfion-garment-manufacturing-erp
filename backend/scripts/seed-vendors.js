/**
 * Seed the Vendors & Suppliers masters — matches test-data.md Step 6. Idempotent (matched by name).
 *   npm run seed:vendors
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const env = require('../src/config/env');
const Supplier = require('../src/modules/suppliers/supplier.model');
const Vendor = require('../src/modules/vendors/vendor.model');
const { nextSeq, pad } = require('../src/common/utils/counters');

const SUPPLIERS = [
  { name: 'Vardhman Textiles',   category: 'Fabric',    location: 'Ludhiana',      gstin: '03AABCV1234A1Z5', paymentTerms: '30 days credit', leadTimeDays: 21, contacts: [{ name: 'Rajesh Bansal', role: 'Sales', phone: '+91 98150 11111', email: 'rajesh@vardhman.example' }] },
  { name: 'Shree Rayon Mills',   category: 'Fabric',    location: 'Surat',         gstin: '24AABCS5678B1Z2', paymentTerms: '45 days credit', leadTimeDays: 18, contacts: [{ name: 'Hitesh Patel',  role: 'Sales', phone: '+91 98250 22222', email: 'hitesh@shreerayon.example' }] },
  { name: 'Precision Labels',    category: 'Accessory', location: 'Noida',         gstin: '09AABCP9012C1Z9', paymentTerms: '30 days credit', leadTimeDays: 7,  contacts: [{ name: 'Pooja Verma',   role: 'Sales', phone: '+91 98110 33333', email: 'pooja@precisionlabels.example' }] },
  { name: 'Kwality Buttons',     category: 'Accessory', location: 'Delhi',         gstin: '07AABCK3456D1Z4', paymentTerms: '15 days credit', leadTimeDays: 5,  contacts: [{ name: 'Sanjay Jain',   role: 'Owner', phone: '+91 98100 44444', email: 'sanjay@kwalitybuttons.example' }] },
  { name: 'Packwell Industries', category: 'Packing',   location: 'Greater Noida', gstin: '09AABCP7890E1Z1', paymentTerms: '30 days credit', leadTimeDays: 4,  contacts: [{ name: 'Neeraj Singh',  role: 'Sales', phone: '+91 98180 55555', email: 'neeraj@packwell.example' }] },
];
const VENDORS = [
  { name: 'Rangoli Prints',        category: 'Printing',   location: 'Noida Phase 2',   gstin: '09AABCR1111F1Z3', pan: 'AABCR1111F', rate: '₹18 / pc', capacity: '5,000 pcs/day', onTimePct: 92, rating: 4.2, contacts: [{ name: 'Irfan Khan',    role: 'Owner',      phone: '+91 98710 66666' }], notes: 'Screen + digital print, 4-day turnaround' },
  { name: 'Stitch Art Embroidery', category: 'Embroidery', location: 'Sahibabad',       gstin: '09AABCS2222G1Z6', pan: 'AABCS2222G', rate: '₹25 / pc', capacity: '3,000 pcs/day', onTimePct: 88, rating: 4.0, contacts: [{ name: 'Kavita Sharma', role: 'Production', phone: '+91 98730 77777' }], notes: '12-head Tajima machines' },
  { name: 'Bluewash Laundry',      category: 'Washing',    location: 'Greater Noida',   gstin: '09AABCB3333H1Z8', pan: 'AABCB3333H', rate: '₹12 / pc', capacity: '8,000 pcs/day', onTimePct: 95, rating: 4.5, contacts: [{ name: 'Deepak Yadav',  role: 'Owner',      phone: '+91 98990 88888' }], notes: 'Enzyme, stone and garment wash; ETP certified' },
  { name: 'Precision Cutting Co.', category: 'Cutting',    location: 'Noida Sector 58', gstin: '09AABCP4444J1Z0', pan: 'AABCP4444J', rate: '₹6 / pc',  capacity: '6,000 pcs/day', onTimePct: 90, rating: 4.1, contacts: [{ name: 'Manoj Tiwari',  role: 'Owner',      phone: '+91 98910 99999' }], notes: 'CAD marker + auto cutter' },
];

(async () => {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  let c = 0, u = 0;
  for (const s of SUPPLIERS) {
    const r = await Supplier.updateOne({ name: s.name }, { $set: s }, { upsert: true });
    r.upsertedCount ? c++ : u++; console.log(`supplier  ${s.name.padEnd(22)} ${s.category.padEnd(10)} ${r.upsertedCount ? 'created' : 'updated'}`);
  }
  for (const v of VENDORS) {
    const existing = await Vendor.findOne({ name: v.name });
    if (existing) { Object.assign(existing, v); await existing.save(); u++; console.log(`vendor    ${v.name.padEnd(22)} ${v.category.padEnd(10)} updated · ${existing.alias}`); }
    else { const doc = await Vendor.create({ ...v, alias: `V-${pad(await nextSeq('vendor'), 2)}` }); c++; console.log(`vendor    ${v.name.padEnd(22)} ${v.category.padEnd(10)} created · ${doc.alias}`); }
  }
  console.log(`\n${c} created · ${u} updated`);
  await mongoose.disconnect();
})().catch((e) => { console.error('seed-vendors failed:', e.message); process.exit(1); });
