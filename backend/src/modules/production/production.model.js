const mongoose = require('mongoose');

const OPS = ['Cutting', 'Stitching', 'Finishing', 'Packing'];
const EXEC = ['In-house', 'Outsourced'];

/** One operation per order per stage; done/pending derived from logs and gate returns (M-11). */
const opSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    styleNo: { type: String, default: '' },
    op: { type: String, enum: OPS, required: true },
    exec: { type: String, enum: EXEC, default: 'In-house' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorAlias: { type: String, default: '' },
    vendorName: { type: String, default: '' },      // confidential — masked in present()
    line: { type: String, default: '' },            // in-house line / section
    plannedQty: { type: Number, default: 0 },
    doneQty: { type: Number, default: 0 },
    rejectedQty: { type: Number, default: 0 },
    blocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: '' },
    jobWorkIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JobWork' }],
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);
opSchema.index({ orderId: 1, op: 1 }, { unique: true });

/** Daily production log — manual from the floor, or auto-appended by a job-work return at the gate (FR-11.2). */
const logSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    op: { type: String, enum: OPS, required: true },
    exec: { type: String, enum: EXEC, default: 'In-house' },
    where: { type: String, default: '' },           // line name, or vendor alias for outsourced
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: { type: String, default: '' },
    workers: { type: Number, default: 0 },
    output: { type: Number, required: true },
    rejected: { type: Number, default: 0 },
    supervisor: { type: String, default: '' },
    source: { type: String, enum: ['manual', 'gate', 'cutting'], default: 'manual' },
    colour: { type: String, default: '' },          // colourway this log is for (WIP by colour)
    loaded: { type: Number, default: 0 },           // pcs loaded onto the line (stitching input) — WIP = Σ loaded − Σ output
    hourly: { type: mongoose.Schema.Types.Mixed, default: {} },   // { '09-10': 80, '10-11': 95 … } hourly output (AFN/40)
    grnNo: { type: String, default: '' },
    note: { type: String, default: '' },
    by: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

/** Daily cutting report (AFN/11): fabric lot → lay → size-wise cut pcs; posts a Cutting log and issues the fabric from stock. */
const cuttingSchema = new mongoose.Schema(
  {
    cutNo: { type: String, unique: true },          // CUT-0001
    date: { type: Date, default: Date.now, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' }, styleNo: { type: String, default: '' }, colour: { type: String, default: '' },
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' }, materialCode: { type: String, default: '' }, materialName: { type: String, default: '' },
    lotNo: { type: String, default: '' }, thans: { type: Number, default: 0 }, widthInches: { type: Number, default: 0 }, layers: { type: Number, default: 0 },
    totalMeters: { type: Number, default: 0 },      // fabric issued to the table
    consumedMeters: { type: Number, default: 0 },   // actually consumed (issued from stock)
    endBitsMeters: { type: Number, default: 0 },
    sizes: { type: mongoose.Schema.Types.Mixed, default: {} },   // { S: 120, M: 240 } cut pcs
    cutPcs: { type: Number, default: 0 }, avgPerPc: { type: Number, default: 0 },
    table: { type: String, default: '' }, cutter: { type: String, default: '' }, remarks: { type: String, default: '' }, by: { type: String, default: '' },
  },
  { timestamps: true },
);

/** Loading plan: per date × line × process, the planned order / colour and target pcs; actual comes from the logs. */
const loadingSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true }, line: { type: String, required: true }, process: { type: String, enum: OPS, default: 'Stitching' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }, orderNo: { type: String, default: '' }, styleNo: { type: String, default: '' }, colour: { type: String, default: '' },
    target: { type: Number, default: 0 }, note: { type: String, default: '' }, by: { type: String, default: '' },
  },
  { timestamps: true },
);
loadingSchema.index({ date: 1, line: 1, process: 1, orderId: 1, colour: 1 }, { unique: true });

const ProductionOp = mongoose.model('ProductionOp', opSchema);
const ProductionLog = mongoose.model('ProductionLog', logSchema);
const CuttingReport = mongoose.model('CuttingReport', cuttingSchema);
const LoadingPlan = mongoose.model('LoadingPlan', loadingSchema);
// P7 indexes — hot list/filter paths
logSchema.index({ orderId: 1, date: -1 });

module.exports = { ProductionOp, ProductionLog, CuttingReport, LoadingPlan, OPS, EXEC };
