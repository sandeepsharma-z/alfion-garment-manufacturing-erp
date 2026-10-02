const mongoose = require('mongoose');
const O = mongoose.Schema.Types.ObjectId;

/** Default defect master (settings.defects can override) — client formats AFN 10 / 21 */
const DEFAULT_DEFECTS = [
  { code: 'BS', name: 'Broken stitch', severity: 'Major' }, { code: 'SS', name: 'Skip stitch', severity: 'Major' }, { code: 'OS', name: 'Open seam', severity: 'Major' },
  { code: 'UH', name: 'Uneven hem', severity: 'Minor' }, { code: 'ST', name: 'Stain / oil mark', severity: 'Major' }, { code: 'SV', name: 'Shade variation', severity: 'Major' },
  { code: 'MO', name: 'Measurement out of tolerance', severity: 'Major' }, { code: 'ML', name: 'Missing / wrong label', severity: 'Major' }, { code: 'HO', name: 'Hole / damage', severity: 'Major' },
  { code: 'PK', name: 'Puckering', severity: 'Minor' }, { code: 'UT', name: 'Untrimmed thread', severity: 'Minor' }, { code: 'WS', name: 'Wrong size / assortment', severity: 'Major' },
];
const FABRIC_CATEGORIES = ['Weaving', 'Patta / selvedge', 'Print / dye defect', 'Hole', 'Hard stain'];

/**
 * Fabric 4-point inspection (AFN 10): points per 100 sq m = total points × 3937 / (metres inspected × width in inches).
 * A failed lot puts the metres on Quality Hold (ledger reserve rows) until released.
 */
const fabricSchema = new mongoose.Schema(
  {
    inspNo: { type: String, unique: true },                  // FI-0001
    gateEntryId: { type: O, ref: 'GateEntry' },
    grnNo: { type: String, default: '' },
    materialId: { type: O, ref: 'Material', required: true },
    materialCode: { type: String, default: '' },
    materialName: { type: String, default: '' },
    supplierName: { type: String, default: '' },
    lot: { type: String, default: '' },
    colour: { type: String, default: '' },
    metersChecked: { type: Number, required: true, min: 0.01 },
    widthInches: { type: Number, default: 58 },
    tagLength: { type: Number, default: 0 }, tagWidth: { type: Number, default: 0 },      // on-tag vs actual (AFN/10 lot rows)
    actualWidth: { type: Number, default: 0 }, thans: { type: Number, default: 0 }, checkInDate: { type: Date },
    unit: { type: String, enum: ['sqm', 'sqyd'], default: 'sqm' },                        // points per 100 sq m (default) or per 100 sq yards
    pointsPer100Yd: { type: Number, default: 0 },
    defects: [{ category: String, p1: Number, p2: Number, p3: Number, p4: Number }],   // counts per point bucket (1/2/3/4 points)
    totalPoints: { type: Number, default: 0 },
    pointsPer100: { type: Number, default: 0 },
    limit: { type: Number, default: 20 },
    result: { type: String, enum: ['Pass', 'Fail'], default: 'Pass' },
    hold: { type: Boolean, default: false },
    holdQty: { type: Number, default: 0 },
    releasedAt: { type: Date },
    releasedBy: { type: String, default: '' },
    inspector: { type: String, default: '' },
    remarks: { type: String, default: '' },
    gsm: { type: String, default: '' },
    photoFileIds: [{ type: O, ref: 'File' }],
    date: { type: Date, default: Date.now },
    by: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

/** Inline / end-line inspection per line per day — DHU = defects × 100 / checked (FR-20.2) */
const inlineSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true },
    line: { type: String, default: '' },
    orderId: { type: O, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    op: { type: String, default: 'Stitching' },
    kind: { type: String, enum: ['Inline', 'End-line'], default: 'Inline' },
    checked: { type: Number, required: true, min: 1 },
    defects: [{ code: String, name: String, severity: String, count: Number }],
    totalDefects: { type: Number, default: 0 },
    dhu: { type: Number, default: 0 },
    inspector: { type: String, default: '' },
    remarks: { type: String, default: '' },
    by: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

/** Mid / final inspection, AQL (AFN 21) — a failed/held Final blocks Dispatch (FR-20.3) */
const aqlSchema = new mongoose.Schema(
  {
    inspNo: { type: String, unique: true },                  // QI-0001
    orderId: { type: O, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    styleNo: { type: String, default: '' },
    stage: { type: String, enum: ['Mid', 'Final'], default: 'Final' },
    date: { type: Date, default: Date.now },
    site: { type: String, default: 'Unit 1 — Noida' },
    inspectorType: { type: String, enum: ['Internal', 'Buyer QA', 'Third party'], default: 'Internal' },
    inspector: { type: String, default: '' },
    merchandiser: { type: String, default: '' },
    colour: { type: String, default: '' },
    sampling: { type: String, enum: ['Reduced', 'Normal', 'Reinforced'], default: 'Normal' },
    aqlLevel: { type: String, default: '2.5' },
    lotSize: { type: Number, default: 0 },
    sampleSize: { type: Number, default: 0 },
    acceptNo: { type: Number, default: 0 },
    rejectNo: { type: Number, default: 1 },
    majors: { type: Number, default: 0 },
    minors: { type: Number, default: 0 },
    defects: [{ code: String, name: String, severity: String, count: Number }],
    cartonsOpened: { type: Number, default: 0 },
    cartonsTotal: { type: Number, default: 0 },
    poQty: { type: Number, default: 0 }, poDate: { type: Date }, shippedQty: { type: Number, default: 0 }, refNo: { type: String, default: '' },   // AFN/21 header: PO qty / date, already shipped, reference
    foundMajors: { type: Number, default: 0 }, allowedMajors: { type: Number, default: 0 },
    checks: { colour: String, fabric: String, outlook: String, packaging: String, pcl: String, assortment: String, marking: String },   // OK | Not OK | N/A
    result: { type: String, enum: ['Pass', 'Fail', 'Hold'], default: 'Pass' },
    holdReason: { type: String, default: '' },
    blocksDispatch: { type: Boolean, default: false },
    reportFileId: { type: O, ref: 'File' },
    photoFileIds: [{ type: O, ref: 'File' }],
    remarks: { type: String, default: '' },
    by: { type: String, default: '' },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

/** Measurement inspection (AFN/22): POM rows × measured pieces of one size against the style spec ± tolerance. */
const measurementSchema = new mongoose.Schema(
  {
    inspNo: { type: String, unique: true },                  // MI-0001
    orderId: { type: O, ref: 'Order', required: true, index: true }, orderNo: { type: String, default: '' }, styleNo: { type: String, default: '' },
    stage: { type: String, enum: ['Inline', 'Pre-final', 'Final'], default: 'Final' },
    date: { type: Date, default: Date.now }, colour: { type: String, default: '' }, size: { type: String, required: true }, unit: { type: String, default: 'cm' },
    pieces: { type: Number, default: 0 },
    rows: [{ code: String, name: String, spec: Number, tolerance: Number, measured: [Number], maxDev: Number, pass: Boolean }],
    passed: { type: Number, default: 0 }, failed: { type: Number, default: 0 }, result: { type: String, enum: ['Pass', 'Fail'], default: 'Pass' },
    inspector: { type: String, default: '' }, remarks: { type: String, default: '' }, by: { type: String, default: '' },
  },
  { timestamps: true },
);

/** Broken needle register (AFN/17): every broken needle, parts recovered, replacement issued. */
const needleSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true }, time: { type: String, default: '' }, line: { type: String, default: '' }, machineNo: { type: String, default: '' },
    operator: { type: String, default: '' }, orderNo: { type: String, default: '' }, needleType: { type: String, default: '' }, needleSize: { type: String, default: '' },
    parts: { point: { type: Boolean, default: false }, shank: { type: Boolean, default: false }, eye: { type: Boolean, default: false }, middle: { type: Boolean, default: false } },   // parts recovered
    allFound: { type: Boolean, default: true }, garmentChecked: { type: Boolean, default: false }, newIssued: { type: Boolean, default: true },
    supervisor: { type: String, default: '' }, remarks: { type: String, default: '' }, by: { type: String, default: '' },
  },
  { timestamps: true },
);

/** Blade / sharp-tool register (AFN/13): received, issued, broken, running balance. */
const bladeSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true }, kind: { type: String, default: 'Cutting blade' },   // Cutting blade / Band knife / Scissor / Trimmer / Seam ripper
    received: { type: Number, default: 0 }, issued: { type: Number, default: 0 }, broken: { type: Number, default: 0 }, returned: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, issuedTo: { type: String, default: '' }, machineNo: { type: String, default: '' }, remarks: { type: String, default: '' }, by: { type: String, default: '' },
  },
  { timestamps: true },
);

// P7 indexes — hot list/filter paths
aqlSchema.index({ orderId: 1, stage: 1 });

module.exports = {
  FabricInspection: mongoose.model('FabricInspection', fabricSchema),
  InlineInspection: mongoose.model('InlineInspection', inlineSchema),
  AqlInspection: mongoose.model('AqlInspection', aqlSchema),
  MeasurementInspection: mongoose.model('MeasurementInspection', measurementSchema),
  NeedleRecord: mongoose.model('NeedleRecord', needleSchema),
  BladeRecord: mongoose.model('BladeRecord', bladeSchema),
  DEFAULT_DEFECTS, FABRIC_CATEGORIES,
};
