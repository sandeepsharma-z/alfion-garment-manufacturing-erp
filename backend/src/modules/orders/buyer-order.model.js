const mongoose = require('mongoose');

/**
 * Buyer order header — the buyer's purchase note / order sheet. One header carries many style lines (Order = one style line,
 * AFI-#### numbering unchanged). Currency, terms and revision live here; qty / price / colours / dates live on the line.
 */
const buyerOrderSchema = new mongoose.Schema(
  {
    poNo: { type: String, required: [true, 'Buyer PO / purchase-note number is required'], trim: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    season: { type: String, default: '' },              // e.g. AW-26
    currency: { type: String, default: 'USD' },
    fxRate: { type: Number, default: 0 },               // ₹ per unit at booking (0 = company default)
    terms: { type: String, default: '' },               // payment terms text (LC at sight / T/T 30 days …)
    incoterm: { type: String, default: 'FOB' },
    latestShipment: { type: Date },                     // buyer's latest shipment date
    deliveryDate: { type: Date },                       // delivery at the buyer's warehouse
    salesMonth: { type: String, default: '' },
    revision: { type: Number, default: 0 },
    revisions: [{ no: Number, at: { type: Date, default: Date.now }, by: String, reason: String, changes: [{ field: String, from: String, to: String }] }],
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
buyerOrderSchema.index({ buyerId: 1, poNo: 1 }, { unique: true });

module.exports = mongoose.model('BuyerOrder', buyerOrderSchema);
