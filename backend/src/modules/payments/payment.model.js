const mongoose = require('mongoose');
const O = mongoose.Schema.Types.ObjectId;

const LC_MILESTONES = [
  { key: 'lc_received', title: 'LC received & checked' }, { key: 'amendment', title: 'Amendment (if any)' }, { key: 'shipped_docs', title: 'Goods shipped & documents prepared' },
  { key: 'negotiated', title: 'Documents negotiated at bank' }, { key: 'credited', title: 'Payment credited' },
];
const TT_MILESTONES = [
  { key: 'advance', title: 'Advance received' }, { key: 'shipped_docs', title: 'Goods shipped & documents sent' }, { key: 'balance', title: 'Balance remitted' }, { key: 'credited', title: 'Payment credited' },
];

/** Payment tracker per export invoice (M-15). payment pending = invoice − Σ receipts (derived). */
const paymentSchema = new mongoose.Schema(
  {
    dispatchId: { type: O, ref: 'Dispatch', index: true },
    invoiceNo: { type: String, default: '' },
    orderId: { type: O, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    buyerId: { type: O, ref: 'Buyer' },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    invoiceDate: { type: Date },
    amount: { type: Number, default: 0 },                    // ₹ invoice value — rates.view
    currency: { type: String, default: 'INR' },
    method: { type: String, enum: ['LC', 'T/T', 'Advance'], default: 'LC' },
    bank: { type: String, default: '' },
    terms: { type: String, default: '' },
    reference: { type: String, default: '' },                // LC no / T-T ref
    dueDate: { type: Date },
    receivedTotal: { type: Number, default: 0 },
    receipts: [{ amount: Number, fxRate: Number, bank: String, creditDate: Date, reference: String, charges: Number, remarks: String, by: String, at: { type: Date, default: Date.now } }],
    milestones: [{ key: String, title: String, detail: String, at: Date, done: { type: Boolean, default: false } }],
    closedAt: { type: Date },
    remarks: { type: String, default: '' },
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
paymentSchema.index({ dueDate: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.LC_MILESTONES = LC_MILESTONES;
module.exports.TT_MILESTONES = TT_MILESTONES;
