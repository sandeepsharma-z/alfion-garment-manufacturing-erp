const mongoose = require('mongoose');

const STAGES = ['Order Confirmed', 'Material Sourcing', 'Job Work', 'Cutting', 'Stitching',
  'Finishing', 'Packing', 'Dispatch', 'Payment', 'Closed'];

/** Confirmed buyer order — created only from an approved sample (FR-3.1). */
const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true },           // AFI-1043 … auto
    sampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sample' },
    sampleNo: { type: String, default: '' },
    sampleRound: { type: Number, default: 0 },
    styleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Style' },
    styleNo: { type: String, required: true },
    description: { type: String, required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    buyerPoNo: { type: String, default: '' },
    buyerOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BuyerOrder' },   // purchase-note header (many style lines per buyer order)
    buyerOrderNo: { type: String, default: '' },
    fabric: { type: String, default: '' },
    colour: { type: String, default: '' },
    sizeRange: { type: String, default: '' },
    accessories: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1 },
    cutQty: { type: Number, default: 0 },
    sizes: [{ size: String, pct: Number, qty: Number }],      // derived: Σ colours per size (or the % grid when no colours)
    sizeSet: { type: [String], default: [] },               // sizes on this order (Settings → size sets, or custom)
    colours: [{ code: String, name: String, qty: Number, cutQty: Number, sizes: [{ size: String, qty: Number, cutQty: Number, barcode: String }] }],   // buyer colour code-wise order
    cutExtraPct: { type: Number, default: 5 },
    unitPrice: { type: Number, default: 0 },           // price per pc in `currency` (buyer price)
    firstPrice: { type: Number, default: 0 },          // first quoted price (final = unitPrice)
    fxRate: { type: Number, default: 1 },              // ₹ per unit of `currency` — fobRate = unitPrice × fxRate
    revision: { type: Number, default: 0 },
    revisions: [{ no: Number, at: { type: Date, default: Date.now }, by: String, reason: String, changes: [{ field: String, from: String, to: String }] }],
    cancelledQty: { type: Number, default: 0 },        // short-shipped / cancelled by the buyer
    targetShipDate: { type: Date },                    // buyer's target (latest shipment); shipDate = contracted
    deliveryDate: { type: Date },                      // delivery at the buyer's warehouse
    salesMonth: { type: String, default: '' },         // buyer's sales month, e.g. 2026-11
    fobRate: { type: Number, default: 0 },             // ₹ per piece — needs rates.view
    currency: { type: String, default: 'INR' },
    shipDate: { type: Date },
    paymentTerms: { type: String, default: 'Letter of Credit (LC) — 60 days' },
    mode: { type: String, enum: ['Sea', 'Air'], default: 'Sea' },
    priority: { type: String, enum: ['Urgent', 'High', 'Normal', 'Low'], default: 'Normal' },
    instructions: { type: String, default: '' },
    specSheet: { version: Number, fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' }, fileName: String, kind: String },
    stage: { type: String, enum: STAGES, default: 'Order Confirmed' },
    progress: { type: Number, default: 0 },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    packRatio: { type: String, default: '' },          // e.g. 'Ratio pack 1-2-2-1'
    pcsPerCarton: { type: Number, default: 0 },
    activity: [{ at: { type: Date, default: Date.now }, by: String, text: String }],
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
orderSchema.index({ status: 1, shipDate: 1 });
orderSchema.index({ buyerId: 1, status: 1 });
orderSchema.index({ stage: 1 });
orderSchema.index({ buyerOrderId: 1 });

module.exports = mongoose.model('Order', orderSchema);
module.exports.STAGES = STAGES;
