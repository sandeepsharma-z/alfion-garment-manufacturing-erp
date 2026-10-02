const mongoose = require('mongoose');

const STATUSES = ['Draft', 'In Review', 'Approved', 'Superseded'];

/** Cutting pattern per style — versioned CAD/PDF files, approval, issue log (M-18). */
const patternSchema = new mongoose.Schema(
  {
    patternNo: { type: String, unique: true },             // PT-0001 … auto
    styleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Style', required: true, index: true },
    styleNo: { type: String, default: '' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer' },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    makerUid: { type: String, default: '' },
    makerName: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    baseSize: { type: String, default: 'M' },
    sizeRange: { type: String, default: 'S – 3XL' },
    gradingStatus: { type: String, enum: ['Not started', 'In progress', 'Graded'], default: 'Not started' },
    markerEff: { type: Number, default: 0 },                // %
    remarks: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'Draft' },
    priority: { type: String, enum: ['Urgent', 'High', 'Normal', 'Low'], default: 'Normal' },
    dueDate: { type: Date },
    sampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sample' },
    sampleNo: { type: String, default: '' },
    sampleRound: { type: Number, default: 0 },
    versions: [{ version: Number, fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' }, fileName: String, kind: String, note: String, by: String, at: { type: Date, default: Date.now } }],
    issues: [{ version: Number, orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, orderNo: String, issuedTo: String, by: String, at: { type: Date, default: Date.now } }],
    reviewNote: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date },
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Pattern' },
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
patternSchema.index({ status: 1 });

module.exports = mongoose.model('Pattern', patternSchema);
module.exports.STATUSES = STATUSES;
