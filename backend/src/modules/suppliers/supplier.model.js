const mongoose = require('mongoose');

/** Material supplier master (fabric mills, trims, packaging) — not confidential per SRS. */
const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Supplier name is required'], trim: true },
    category: { type: String, enum: ['Fabric', 'Accessory', 'Packing', 'Mixed'], default: 'Fabric' },
    location: { type: String, default: '' },
    gstin: { type: String, default: '' },
    contacts: [{ name: String, role: String, email: String, phone: String }],
    paymentTerms: { type: String, default: '30 days credit' },
    leadTimeDays: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

module.exports = mongoose.model('Supplier', supplierSchema);
