const mongoose = require('mongoose');

/**
 * Money going OUT: what we owe job-work vendors (challans) and material suppliers (purchase orders).
 * A payment always names the documents it settles, so every challan / PO carries its own paid vs balance.
 */
const payableSchema = new mongoose.Schema(
  {
    payNo: { type: String, unique: true },                       // PAY-0001
    partyKind: { type: String, enum: ['vendor', 'supplier'], required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    partyName: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true, min: 0.01 },         // ₹ paid in this voucher
    method: { type: String, enum: ['Bank transfer', 'NEFT / RTGS', 'UPI', 'Cheque', 'Cash', 'Adjustment'], default: 'Bank transfer' },
    reference: { type: String, default: '' },                    // UTR / cheque no
    tdsAmount: { type: Number, default: 0 },
    note: { type: String, default: '' },
    lines: [{                                                    // what this voucher settles
      kind: { type: String, enum: ['jobwork', 'po', 'advance'], default: 'jobwork' },
      refId: { type: mongoose.Schema.Types.ObjectId },
      refNo: { type: String, default: '' },
      amount: { type: Number, default: 0 },
    }],
    by: { type: String, default: '' },
  },
  { timestamps: true },
);
payableSchema.index({ partyKind: 1, partyId: 1 });
payableSchema.index({ 'lines.refId': 1 });

module.exports = mongoose.model('Payable', payableSchema);
