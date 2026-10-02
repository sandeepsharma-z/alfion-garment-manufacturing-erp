const mongoose = require('mongoose');

const PROCESSES = ['Dyeing', 'Printing', 'Softening', 'Washing', 'Embroidery', 'Cutting', 'Stitching', 'Finishing', 'Other'];

/** Job-work vendor master — confidential (SEC-3): identity, rates and bank hidden without the flag. */
const vendorSchema = new mongoose.Schema(
  {
    alias: { type: String, unique: true },            // V-01 … auto
    name: { type: String, required: [true, 'Vendor name is required'], trim: true },
    category: { type: String, enum: PROCESSES, required: true },
    location: { type: String, default: '' },
    gstin: { type: String, default: '' },
    pan: { type: String, default: '' },
    contacts: [{ name: String, role: String, email: String, phone: String }],
    rate: { type: String, default: '' },              // e.g. "₹34 / kg"
    capacity: { type: String, default: '' },          // e.g. "12 T/day"
    onTimePct: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    bank: { name: String, ifsc: String, account: String },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

module.exports = mongoose.model('Vendor', vendorSchema);
module.exports.PROCESSES = PROCESSES;
