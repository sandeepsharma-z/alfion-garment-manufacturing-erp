const mongoose = require('mongoose');
const O = mongoose.Schema.Types.ObjectId;

const DOC_TYPES = ['Commercial Invoice', 'Packing List', 'E-Way Bill', 'Delivery Challan', 'Certificate of Origin', 'GSP Form A', 'Bill of Lading', 'Airway Bill', 'Carton Marks'];
const GENERATED = ['Commercial Invoice', 'Packing List', 'Delivery Challan', 'Certificate of Origin', 'E-Way Bill', 'Carton Marks'];   // server-generated (HTML print) — the rest are uploaded
const STATUSES = ['Docs In Progress', 'Ready to Ship', 'Shipped On Board', 'In Transit', 'Delivered'];
const INCOTERMS = ['FOB', 'CFR', 'CIF', 'CNF', 'CPT', 'DAP', 'DDP', 'EXW'];
const TRACK = [
  { key: 'stuffing', title: 'Factory stuffing' }, { key: 'customs', title: 'Customs clearance' }, { key: 'onboard', title: 'Shipped on board' },
  { key: 'transit', title: 'In transit' }, { key: 'delivered', title: 'Delivered' },
];

/** One invoice line = one style line (order) or one colour of it — HS code, buyer-currency price, INR taxable value. */
const lineSchema = new mongoose.Schema({
  orderId: { type: O, ref: 'Order', required: true }, orderNo: { type: String, default: '' }, buyerPoNo: { type: String, default: '' },
  styleNo: { type: String, default: '' }, description: { type: String, default: '' }, colour: { type: String, default: '' }, hsCode: { type: String, default: '' },
  qty: { type: Number, default: 0 }, unitPrice: { type: Number, default: 0 }, currency: { type: String, default: 'USD' },
  amountFx: { type: Number, default: 0 }, amountInr: { type: Number, default: 0 },
}, { _id: false });

/** Box-wise packing (box × style × colour code × size × pcs) — the buyer's packing-list matrix. */
const boxSchema = new mongoose.Schema({
  from: Number, to: Number, orderId: { type: O, ref: 'Order' }, styleNo: String, colourCode: String, colour: String,
  sizes: { type: mongoose.Schema.Types.Mixed, default: {} },      // { S: 12, M: 12 } pcs per box
  pcs: { type: Number, default: 0 }, grossKg: { type: Number, default: 0 }, netKg: { type: Number, default: 0 }, dims: { type: String, default: '' },   // 60×40×40 cm
}, { _id: false });

/** Export invoice / shipment (M-14). Status is derived from documents and tracking events. Multi-line: many style lines of one buyer per invoice. */
const dispatchSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, unique: true },                 // AFI/EXP/26-27/0183
    orderId: { type: O, ref: 'Order', required: true, index: true },   // first line's order (order page links, TNA) — every line is in `lines`
    orderNo: { type: String, default: '' },
    buyerId: { type: O, ref: 'Buyer' },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    buyerPoNo: { type: String, default: '' },
    buyerOrderNo: { type: String, default: '' },
    styleNo: { type: String, default: '' },
    description: { type: String, default: '' },
    lines: { type: [lineSchema], default: [] },
    invoiceDate: { type: Date, default: Date.now },
    mode: { type: String, enum: ['Air', 'Sea'], default: 'Sea' },
    portOfLoading: { type: String, default: '' },
    portOfDischarge: { type: String, default: '' },
    preCarriage: { type: String, default: '' },                // by road / rail to the port
    placeOfReceipt: { type: String, default: '' },
    finalDestination: { type: String, default: '' },
    countryOfOrigin: { type: String, default: 'India' },
    incoterm: { type: String, enum: INCOTERMS, default: 'FOB' },
    consignee: { name: { type: String, default: '' }, address: { type: String, default: '' }, country: { type: String, default: '' } },
    notifyParty: { type: String, default: '' },
    qty: { type: Number, default: 0 },
    cartons: { type: Number, default: 0 },
    boxes: { type: [boxSchema], default: [] },
    grossWeightKg: { type: Number, default: 0 },
    netWeightKg: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    fxRate: { type: Number, default: 1 },                      // ₹ per unit of currency on the invoice
    totalFx: { type: Number, default: 0 },                     // Σ line amounts in currency
    taxableInr: { type: Number, default: 0 },                  // Σ line INR
    igstPct: { type: Number, default: 0 },
    igstInr: { type: Number, default: 0 },
    totalInr: { type: Number, default: 0 },
    advanceFx: { type: Number, default: 0 },                   // "Less - Advance" on the buyer's invoice format
    proformaNo: { type: String, default: '' },                 // proforma invoice reference(s)
    cartonDims: { type: String, default: '' },                 // measurements / carton, e.g. 60X40X30
    marksAndNos: { type: String, default: '' },                // shipping marks block
    amountInWords: { type: String, default: '' },              // INR total
    amountInWordsFx: { type: String, default: '' },            // currency total
    invoiceValue: { type: Number, default: 0 },                // ₹ = totalInr — rates.view (payments tracker)
    hsnCode: { type: String, default: '6205' },
    paymentMethod: { type: String, enum: ['LC', 'T/T', 'Advance'], default: 'LC' },
    paymentTerms: { type: String, default: '' },
    lcNo: { type: String, default: '' },
    lcDate: { type: Date },
    reverseCharge: { type: Boolean, default: false },
    documents: [{ type: { type: String }, status: { type: String, enum: ['Pending', 'Generated', 'Uploaded'], default: 'Pending' }, number: String,
      fileId: { type: O, ref: 'File' }, fileName: String, at: Date, by: String }],
    tracking: [{ key: String, title: String, detail: String, at: Date, done: { type: Boolean, default: false } }],
    vesselOrFlight: { type: String, default: '' },
    blOrAwbNo: { type: String, default: '' },
    containerNo: { type: String, default: '' },
    sealNo: { type: String, default: '' },
    shippingBillNo: { type: String, default: '' },
    ewayBillNo: { type: String, default: '' },
    transporter: { type: String, default: '' },
    eta: { type: Date },
    remarks: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
dispatchSchema.index({ invoiceDate: -1 });
dispatchSchema.index({ 'lines.orderId': 1 });

module.exports = mongoose.model('Dispatch', dispatchSchema);
module.exports.DOC_TYPES = DOC_TYPES;
module.exports.GENERATED = GENERATED;
module.exports.STATUSES = STATUSES;
module.exports.INCOTERMS = INCOTERMS;
module.exports.TRACK = TRACK;
