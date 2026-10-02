const mongoose = require('mongoose');
const O = mongoose.Schema.Types.ObjectId;

const CATEGORIES = ['Company licence', 'Insurance', 'Certification', 'Buyer audit', 'Bank / IEC / GST', 'Format / Template', 'Other'];

/** Statutory & buyer-compliance document with expiry reminders (M-21). Formats / templates are reusable blank forms (C3). */
const complianceSchema = new mongoose.Schema(
  {
    docNo: { type: String, unique: true },                    // CD-0001
    title: { type: String, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    authority: { type: String, default: '' },
    number: { type: String, default: '' },
    issueDate: { type: Date },
    expiryDate: { type: Date, index: true },
    ownerUid: { type: String, default: '' },
    ownerName: { type: String, default: '' },
    confidential: { type: Boolean, default: false },
    renewalInProgress: { type: Boolean, default: false },
    versions: [{ version: Number, fileId: { type: O, ref: 'File' }, fileName: String, note: String, expiryDate: Date, by: String, at: { type: Date, default: Date.now } }],
    attachments: [{ fileId: { type: O, ref: 'File' }, fileName: String, size: Number, by: String, at: { type: Date, default: Date.now } }],   // annexures / supporting files (not renewals)
    reminders: [{ offsetDays: Number, sentAt: { type: Date, default: Date.now }, channel: { type: String, default: 'in-app' } }],
    dismissed: { until: Date, reason: String, by: String, at: Date },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
complianceSchema.index({ category: 1 });

module.exports = mongoose.model('ComplianceDoc', complianceSchema);
module.exports.CATEGORIES = CATEGORIES;
