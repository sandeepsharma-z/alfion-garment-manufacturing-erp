const mongoose = require('mongoose');
const O = mongoose.Schema.Types.ObjectId;

/** Shareable tracking code (M-22). The token is the only credential; an optional PIN adds a second factor. */
const trackingSchema = new mongoose.Schema(
  {
    token: { type: String, unique: true, index: true },        // AB7K-93XQ
    kind: { type: String, enum: ['order', 'buyer'], required: true },
    orderId: { type: O, ref: 'Order' },
    orderNo: { type: String, default: '' },
    buyerId: { type: O, ref: 'Buyer' },
    buyerAlias: { type: String, default: '' },
    label: { type: String, default: '' },
    pinHash: { type: String, default: '' },
    secretKind: { type: String, enum: ['pin', 'password'], default: 'pin' },
    detail: { type: String, enum: ['stages', 'full'], default: 'stages' },   // 'full' = the whole T&A plan + production / quality / packing / shipment
    expiresAt: { type: Date },
    revokedAt: { type: Date },
    revokedBy: { type: String, default: '' },
    views: [{ at: { type: Date, default: Date.now }, ip: String, ua: String, ok: Boolean }],
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('TrackingCode', trackingSchema);
