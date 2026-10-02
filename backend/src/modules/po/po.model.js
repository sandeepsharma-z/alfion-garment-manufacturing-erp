const mongoose = require('mongoose');

const STATUSES = ['Pending Approval', 'Ordered', 'In Transit', 'Partially Received', 'Fully Received', 'Cancelled'];
const OPEN = ['Ordered', 'In Transit', 'Partially Received'];

/**
 * Purchase order — one material per PO (as in the approved demo).
 * receivedQty only ever changes through a Gate Entry (FR-7.2); receipts are append-only.
 */
const poSchema = new mongoose.Schema(
  {
    poNo: { type: String, unique: true },                    // PO-2296 … auto
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    materialCode: { type: String, default: '' },
    materialName: { type: String, default: '' },
    category: { type: String, default: '' },
    uom: { type: String, default: '' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNo: { type: String, default: '' },
    orderedQty: { type: Number, required: true, min: 0.01 },
    receivedQty: { type: Number, default: 0 },
    rejectedQty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },                       // ₹ per UOM — needs rates.view
    value: { type: Number, default: 0 },
    poDate: { type: Date, default: Date.now },
    eta: { type: Date },
    paymentTerms: { type: String, default: '30 days credit' },
    deliveryAt: { type: String, default: 'Unit 1 — Noida' },
    notes: { type: String, default: '' },
    priority: { type: String, enum: ['Urgent', 'High', 'Normal', 'Low'], default: 'Normal' },
    status: { type: String, enum: STATUSES, default: 'Ordered' },
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date },
    receipts: [{
      grnNo: String, gateEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'GateEntry' },
      qty: Number, rejectedQty: Number, challanNo: String, date: { type: Date, default: Date.now }, by: String,
    }],
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);
poSchema.virtual('remainingQty').get(function () { return Math.max(this.orderedQty - this.receivedQty, 0); });
poSchema.set('toObject', { virtuals: true });

// P7 indexes — hot list/filter paths
poSchema.index({ status: 1 });
poSchema.index({ supplierId: 1, status: 1 });
poSchema.index({ orderId: 1 });

module.exports = mongoose.model('PurchaseOrder', poSchema);
module.exports.STATUSES = STATUSES;
module.exports.OPEN = OPEN;
