const mongoose = require('mongoose');

/** Style master — the product identity that samples, BOM, patterns and orders hang off. */
const styleSchema = new mongoose.Schema(
  {
    styleNo: { type: String, required: [true, 'Style number is required'], unique: true, uppercase: true, trim: true },
    description: { type: String, required: [true, 'Description is required'], trim: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer' },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    productType: { type: String, default: '' },        // Shirt, Top, Dress …
    fabric: { type: String, default: '' },
    colour: { type: String, default: '' },
    sizeRange: { type: String, default: 'S – 3XL' },
    imageFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    sizeSet: { type: [String], default: [] },                       // sizes the POM spec is written for
    pom: [{ code: String, name: String, tolerance: Number, spec: { type: mongoose.Schema.Types.Mixed, default: {} } }],   // measurement spec: { size: cm } per POM
    pomUnit: { type: String, enum: ['cm', 'in'], default: 'cm' },
    techPack: {                                                     // buyer tech-pack facts printed on the spec sheet
      composition: { type: String, default: '' }, lining: { type: String, default: '' }, article: { type: String, default: '' },
      construction: { type: String, default: '' }, labelPlacement: { type: String, default: '' }, packingMethod: { type: String, default: '' },
      accessories: [{ item: String, qtyPerPc: Number, note: String }],
    },
    approvals: [{                                                  // approvals board (lab dip / strike-offs / trim card / sample kinds …)
      title: String, group: { type: String, default: 'Approval' }, dueDate: Date, pcsPerColour: Number, receivedOn: Date, submittedOn: Date, awb: String,
      approvedOn: Date, commentsOn: Date, status: { type: String, default: 'Pending' }, comment: String, by: String,
    }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Style', styleSchema);
