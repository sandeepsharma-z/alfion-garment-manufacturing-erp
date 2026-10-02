const mongoose = require('mongoose');

const STATUSES = ['In Sampling', 'Sent', 'Client Review', 'Revision', 'Approved', 'Rejected'];
const TYPES = ['Proto Sample', 'Fit Sample', 'Revised Fit Sample', 'Size Set', 'PP Sample', 'Exhibition Sample', 'Salesman Sample', 'Photoshoot Sample', 'SMS (1st of bulk)', 'TOP Sample'];

/**
 * Sample development — the pre-order loop:
 * Created → Sent → Client Review → Changes Requested (Revision) → new round → … → Approved → Spec Sheet → Order
 */
const sampleSchema = new mongoose.Schema(
  {
    sampleNo: { type: String, unique: true },          // SMP-319 … auto
    styleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Style' },
    styleNo: { type: String, required: true },
    description: { type: String, required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    type: { type: String, enum: TYPES, default: 'Proto Sample' },
    pieces: { type: Number, default: 4 },
    colourways: { type: Number, default: 1 },
    fabric: { type: String, default: '' },
    colour: { type: String, default: '' },
    sizeRange: { type: String, default: 'S – 3XL' },
    accessories: { type: String, default: '' },
    targetDate: { type: Date },
    notes: { type: String, default: '' },
    priority: { type: String, enum: ['Urgent', 'High', 'Normal', 'Low'], default: 'Normal' },
    status: { type: String, enum: STATUSES, default: 'In Sampling' },
    round: { type: Number, default: 1 },
    rounds: [{
      no: Number,
      title: String,               // "Round 1 · Proto sample"
      type: { type: String },      // field literally named "type" — needs the object form
      sentOn: Date,
      awb: String,                 // courier tracking
      courier: String,             // courier method used for this round
      comment: String,             // buyer feedback
      result: { type: String, enum: ['sent', 'approved', 'changes', 'rejected', 'pending'], default: 'pending' },
      size: String,                // size measured this round
      measurements: [{ code: String, measured: Number, instruction: String, revised: Number }],   // POM measured + buyer instruction (comment sheet); revised = updated spec for the measured size after the buyer's comments
      dueDate: Date, pcsPerColour: Number, actualSentOn: Date, commentsOn: Date,   // sample plan columns (buyer's sample status sheet)
      by: String,
      at: { type: Date, default: Date.now },
    }],
    specSheets: [{
      version: Number,
      kind: { type: String, enum: ['generated', 'uploaded'], default: 'uploaded' },
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
      fileName: String,
      by: String,
      at: { type: Date, default: Date.now },
    }],
    approvedAt: { type: Date },
    approvedBy: { type: String, default: '' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNo: { type: String, default: '' },
    merchandiser: { type: String, default: '' },
    swatch: { type: String, default: '#8ba9c9' },
    /* one row per piece being sent — photo + its own fabric / colour / sizes (fabric, colour, pieces, colourways above are derived from these) */
    items: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },          // cover photo = photos[0]
      fileName: { type: String, default: '' },
      photos: [{ fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' }, fileName: String }],   // any number of views of the same piece

      description: { type: String, default: '' },
      fabric: { type: String, default: '' },
      colour: { type: String, default: '' },
      sizes: { type: String, default: '' },
      qty: { type: Number, default: 1 },
      notes: { type: String, default: '' },
    }],
    /* buyer sample-status sheet columns that belong to the whole sample (the per-round dates live on rounds[]) */
    tracking: {
      articleNo: { type: String, default: '' },        // buyer article / item no
      factory: { type: String, default: '' },          // FCTY
      processes: { type: String, default: '' },        // print / emb / wash …
      colourQtyOn: { type: Date },                     // colour & qty detail received
      bomOn: { type: Date },                           // BOM received
      techPackOn: { type: Date },                      // tech pack received
      artworkOn: { type: Date },                       // artwork received
      ccMaterial: { type: String, default: '' },       // CC material status
      remarks: { type: String, default: '' },
    },
    /* style-wise material requirement (client format): what one piece eats — the BOM is built from this */
    materialPlan: {
      qty: { type: Number, default: 0 },            // order quantity the sheet is worked out on
      garmentType: { type: String, default: '' },
      sizeRatio: { type: String, default: '' },
      colour: { type: String, default: '' },
      deliveryDate: { type: Date },
      remarks: { type: String, default: '' },
      updatedBy: { type: String, default: '' },
      updatedAt: { type: Date },
    },
    materials: [{
      group: { type: String, default: '' },         // catalog group: Fabric / Trims / Labels …
      item: { type: String, default: '' },          // Main Fabric, Sewing Thread, Button …
      description: { type: String, default: '' },   // "Beige 100% linen"
      unit: { type: String, default: '' },
      perPc: { type: Number, default: 0 },          // consumption per piece
      wastePct: { type: Number, default: 0 },
      materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },   // linked stock item (blank = not in the master yet)
      materialCode: { type: String, default: '' },
      supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
      supplierName: { type: String, default: '' },
      moq: { type: Number, default: 0 },
      requiredDate: { type: Date },
      remarks: { type: String, default: '' },
    }],
    /* costing sheet (client format): fabric / trims / processes / charges → wastage → sending → profit */
    costing: {
      currency: { type: String, default: 'USD' },
      exchangeRate: { type: Number, default: 0 },      // ₹ per unit of currency
      targetPrice: { type: Number, default: 0 },       // buyer's target in currency
      fabrics: [{ item: String, description: String, yardage: Number, shrinkPct: Number, actYard: Number, rate: Number, amount: Number, party: String, note: String }],
      trims: [{ item: String, description: String, qty: Number, unit: String, rate: Number, amount: Number, party: String, note: String }],
      processes: [{ item: String, qty: Number, rate: Number, amount: Number, note: String }],
      charges: [{ item: String, qty: Number, rate: Number, amount: Number, note: String }],
      wastagePct: { type: Number, default: 0 },
      profitPct: { type: Number, default: 0 },
      totals: { material: Number, process: Number, sub: Number, wastage: Number, afterWastage: Number, charges: Number, afterCharges: Number, profit: Number, final: Number, finalFx: Number },
      notes: { type: String, default: '' },
      updatedBy: { type: String, default: '' },
      updatedAt: { type: Date },
    },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // values for Settings → sample form fields, keyed by field key
    courier: {
      method: { type: String, default: '' },      // DHL Express / FedEx / … / Hand carry
      awb: { type: String, default: '' },
      receiver: { type: String, default: '' },    // contact at the buyer's end
      notes: { type: String, default: '' },       // boxes, weight, account no …
    },
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
sampleSchema.index({ status: 1 });
sampleSchema.index({ buyerId: 1 });

module.exports = mongoose.model('Sample', sampleSchema);
module.exports.STATUSES = STATUSES;
module.exports.TYPES = TYPES;
