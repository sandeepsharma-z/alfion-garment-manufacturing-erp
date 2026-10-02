const mongoose = require('mongoose');

/** Buyer master — confidential (SEC-3). Non-privileged users only ever see alias + country. */
const buyerSchema = new mongoose.Schema(
  {
    alias: { type: String, unique: true },            // B-01 … auto
    brand: { type: String, required: [true, 'Brand name is required'], trim: true },
    legalName: { type: String, default: '' },
    country: { type: String, default: '' },
    currency: { type: String, default: 'USD' },
    contacts: [{ name: String, role: String, email: String, phone: String }],
    address: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    bank: { name: String, swift: String, account: String },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    portalMasterLink: { type: Boolean, default: true },   // buyer-wise tracking link allowed (FR-22.5)
    /** Filled once per buyer — every invoice / packing list of this buyer starts from these values. */
    shipping: {
      consigneeName: { type: String, default: '' }, consigneeAddress: { type: String, default: '' }, consigneeCountry: { type: String, default: '' },
      notifyParty: { type: String, default: '' },                 // "buyer, if other than consignee"
      preCarriage: { type: String, default: '' }, placeOfReceipt: { type: String, default: '' },
      portOfLoading: { type: String, default: '' }, portOfDischarge: { type: String, default: '' },
      placeOfDelivery: { type: String, default: '' }, finalDestination: { type: String, default: '' },
      mode: { type: String, default: '' }, incoterm: { type: String, default: '' }, paymentMethod: { type: String, default: '' },
      hsCode: { type: String, default: '' }, marksAndNos: { type: String, default: '' },
      pcsPerCarton: { type: Number, default: 0 }, cartonDims: { type: String, default: '' },
      grossPerCartonKg: { type: Number, default: 0 }, netPerCartonKg: { type: Number, default: 0 },
    },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

module.exports = mongoose.model('Buyer', buyerSchema);
