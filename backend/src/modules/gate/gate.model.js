const mongoose = require('mongoose');

const INSPECTION = ['Passed 4-point', 'Passed with deviation', 'Rejected'];

/**
 * Gate entry — the only path by which stock increases (FR-12). One row per truck / installment.
 * kind 'po' = purchase receipt (Phase 2); 'jw' = job-work return (Phase 3, same shape).
 */
const gateSchema = new mongoose.Schema(
  {
    gateNo: { type: String, unique: true },            // GE-0001 …
    grnNo: { type: String, unique: true },             // GRN-0001 …
    kind: { type: String, enum: ['po', 'jw'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    refNo: { type: String, default: '' },              // PO-2295 / JW-0012
    partyName: { type: String, default: '' },          // supplier name (vendor alias for jw)
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialCode: { type: String, default: '' },
    materialName: { type: String, default: '' },
    uom: { type: String, default: '' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNo: { type: String, default: '' },
    orderedQty: { type: Number, default: 0 },          // ordered (po) / sent (jw)
    previousQty: { type: Number, default: 0 },
    receivedQty: { type: Number, required: true },
    rejectedQty: { type: Number, default: 0 },
    totalAfter: { type: Number, default: 0 },
    remainingAfter: { type: Number, default: 0 },
    statusAfter: { type: String, default: '' },
    vehicleNo: { type: String, default: '' },
    driverName: { type: String, default: '' },
    challanNo: { type: String, default: '' },
    invoiceNo: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    time: { type: String, default: '' },
    receivedBy: { type: String, default: '' },
    inspection: { type: String, enum: INSPECTION, default: 'Passed 4-point' },
    godown: { type: String, default: '' },
    remarks: { type: String, default: '' },
    photoFileIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }],
    lots: [{ lotNo: String, colour: String, thans: Number, tagLength: Number, actualLength: Number, tagWidth: Number, actualWidth: Number, gsm: Number, remarks: String }],   // fabric lots on this GRN (dyeing lot-wise)
    clientUuid: { type: String, unique: true, sparse: true },   // idempotent posts (SRS 7.3 #5)
    by: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);
gateSchema.index({ createdAt: -1 });

// P7 indexes — hot list/filter paths
gateSchema.index({ kind: 1, createdAt: -1 });

module.exports = mongoose.model('GateEntry', gateSchema);
module.exports.INSPECTION = INSPECTION;
