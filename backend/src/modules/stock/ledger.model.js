const mongoose = require('mongoose');

const TXN = ['opening', 'receipt', 'issue_jw', 'return_jw', 'adjust', 'reserve', 'release', 'issue_prod', 'reversal'];

/**
 * Stock ledger — append-only (SRS 8.4 / 8.8). Every physical or reservation movement is one row;
 * Material.physicalQty / reservedQty are the cached running balances, written together with the row.
 * Corrections are new 'reversal' / 'adjust' rows — rows are never updated or deleted.
 */
const ledgerSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    materialCode: { type: String, default: '' },
    materialName: { type: String, default: '' },
    uom: { type: String, default: '' },
    txn: { type: String, enum: TXN, required: true },
    qty: { type: Number, default: 0 },            // signed physical delta
    reservedDelta: { type: Number, default: 0 },  // signed reserved delta
    balanceAfter: { physical: Number, reserved: Number },
    refType: { type: String, default: '' },       // po | gate | order | jobwork | adjust
    refId: { type: mongoose.Schema.Types.ObjectId },
    refNo: { type: String, default: '' },         // PO-2295 · GRN-0007 · AFI-1043 …
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    orderNo: { type: String, default: '' },
    godown: { type: String, default: '' },
    note: { type: String, default: '' },
    by: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ledgerSchema.index({ materialId: 1, createdAt: -1 });

module.exports = mongoose.model('StockLedger', ledgerSchema);
module.exports.TXN = TXN;
