const mongoose = require('mongoose');
const { PROCESSES } = require('../vendors/vendor.model');

const STATUSES = ['Sent to Vendor', 'Partially Received', 'Received', 'Cancelled'];
const OPEN = ['Sent to Vendor', 'Partially Received'];
const OPS = ['Cutting', 'Stitching', 'Finishing', 'Packing'];

/**
 * Job-work challan (M-10). Location is never stored — it is derived from sentQty vs returnedQty (FR-10.1).
 * returnedQty changes only through a Gate Entry of kind 'jw' (FR-10.2); returns are append-only.
 */
const jobWorkSchema = new mongoose.Schema(
  {
    challanNo: { type: String, unique: true },             // JW-0775 … auto
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    styleNo: { type: String, default: '' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    vendorAlias: { type: String, default: '' },
    vendorName: { type: String, default: '' },              // confidential — masked in present()
    process: { type: String, enum: PROCESSES, required: true },
    processDesc: { type: String, default: '' },             // free text when process = Other (FR-10.3)
    op: { type: String, enum: [...OPS, ''], default: '' }, // production operation this challan executes, if any
    itemDesc: { type: String, required: true },             // "Cut panels", "Rayon greige" …
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialCode: { type: String, default: '' },
    uom: { type: String, default: 'pcs' },
    sentQty: { type: Number, required: true, min: 0.01 },
    returnedQty: { type: Number, default: 0 },
    rejectedQty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },                     // ₹ per uom — vendor.confidential
    outDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    instructions: { type: String, default: '' },
    priority: { type: String, enum: ['Urgent', 'High', 'Normal', 'Low'], default: 'Normal' },
    status: { type: String, enum: STATUSES, default: 'Sent to Vendor' },
    returns: [{ grnNo: String, gateEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'GateEntry' }, qty: Number, rejectedQty: Number,
      vendorChallanNo: String, date: { type: Date, default: Date.now }, by: String }],
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
jobWorkSchema.index({ status: 1 });
jobWorkSchema.index({ vendorId: 1, status: 1 });

module.exports = mongoose.model('JobWork', jobWorkSchema);
module.exports.STATUSES = STATUSES;
module.exports.OPEN = OPEN;
module.exports.OPS = OPS;
