const mongoose = require('mongoose');

/**
 * Material master (fabric / accessory / packing).
 * physicalQty / reservedQty are the Phase-1 balances; Phase 2 replaces direct edits
 * with the append-only stock ledger (balances then become derived).
 */
const materialSchema = new mongoose.Schema(
  {
    code: { type: String, required: [true, 'Material code is required'], unique: true, uppercase: true, trim: true },
    name: { type: String, required: [true, 'Material name is required'], trim: true },
    category: { type: String, enum: ['Fabric', 'Accessory', 'Packing'], required: true },
    itemType: { type: String, default: '' },            // client material list: Main fabric / Lining / Interlining / Sewing thread / Main label / Zipper …
    moq: { type: Number, default: 0 },                  // supplier minimum order qty (final PO qty = max(shortage, MOQ))
    leadDays: { type: Number, default: 0 },
    uom: { type: String, default: 'pcs' },              // mtr | kg | pcs | set | roll | cone
    rate: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    godown: { type: String, default: '' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, default: '' },
    suppliers: [{ supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' }, name: String, rate: Number, moq: Number, leadDays: Number, note: String }],   // alternate sources — compared when raising a PO
    physicalQty: { type: Number, default: 0 },
    reservedQty: { type: Number, default: 0 },
    spec: { type: String, default: '' },                // GSM, width, shade …
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

materialSchema.virtual('freeQty').get(function () { return this.physicalQty - this.reservedQty; });
materialSchema.set('toObject', { virtuals: true });

/** Derived stock state — identical rule to the approved demo. */
materialSchema.methods.stockState = function () {
  const free = this.physicalQty - this.reservedQty;
  if (this.physicalQty === 0) return 'Out of Stock';
  if (free < 0) return 'Short for Orders';
  if (this.physicalQty <= this.reorderLevel) return 'Below Reorder';
  return 'Healthy';
};

// P7 indexes — hot list/filter paths
materialSchema.index({ category: 1 });

/** The client's material-requirement categories (AFN material list) — suggestions for itemType, grouped by stock category. */
const ITEM_TYPES = {
  Fabric: ['Main fabric (FAB-A)', 'Fabric B (FAB-B)', 'Fabric C (FAB-C)', 'Lining', 'Pocketing', 'Interlining / fusing', 'Rib / collar', 'Mesh / net', 'Lace', 'Elastic fabric'],
  Accessory: ['Sewing thread', 'Embroidery thread', 'Main label', 'Size label', 'Care / wash label', 'Country-of-origin label', 'Hang tag', 'Price tag / sticker', 'Barcode / JAN sticker', 'Button', 'Snap / rivet', 'Zipper', 'Zipper puller', 'Hook & eye', 'Eyelet', 'Drawcord', 'Cord stopper', 'Elastic', 'Tape / twill tape', 'Velcro', 'Shoulder pad', 'Sequin / bead', 'Print / transfer', 'Embroidery badge', 'Belt', 'Buckle', 'Chain', 'Fabric swatch card', 'Sample fabric', 'Wash / dyeing chemical'],
  Packing: ['Poly bag', 'Hanger', 'Sizer / hanger clip', 'Tissue paper', 'Butter paper', 'Collar stand / insert', 'Clip / pin', 'Silica gel', 'Carton', 'Inner carton', 'Carton sticker', 'Tape', 'Strap', 'Shipping mark stencil', 'Pallet'],
};

module.exports = mongoose.model('Material', materialSchema);
module.exports.ITEM_TYPES = ITEM_TYPES;
