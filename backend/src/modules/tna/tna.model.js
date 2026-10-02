const mongoose = require('mongoose');

/** Standard activity set (FR-19.1) — key, activity, stage, dept, default owner role, anchor, offset days, duration, auto-fill event */
const ACTIVITIES = [
  ['order_confirm', 'Order confirmation', 'Samples', 'Merchandising', 'Merchandising Head', 'order', 0, 1, 'order'],
  ['spec', 'Specification sheet', 'Samples', 'Merchandising', 'Merchandising Head', 'order', 3, 2, 'spec'],
  ['pp_sample', 'PP sample approval', 'Samples', 'Merchandising', 'Merchandising Head', 'order', 5, 5, 'pp_sample'],
  ['pattern', 'Pattern approval', 'Samples', 'Sampling', 'Sampling Incharge', 'order', 7, 3, 'pattern'],
  ['fit_sample', 'Fit sample approval', 'Samples', 'Merchandising', 'Merchandising Head', 'order', 3, 4, 'fit_sample'],
  ['size_set', 'Size-set approval', 'Samples', 'Sampling', 'Sampling Incharge', 'order', 10, 4, 'size_set'],
  ['lab_dip', 'Lab dip approval', 'Materials', 'Merchandising', 'Merchandising Head', 'order', 4, 5, 'lab_dip'],
  ['strike_off', 'Print / embroidery / wash strike-off', 'Materials', 'Merchandising', 'Merchandising Head', 'order', 6, 6, 'strike_off'],
  ['trim_card', 'Trim card approval', 'Materials', 'Merchandising', 'Merchandising Head', 'order', 8, 4, 'trim_card'],
  ['top_sample', 'TOP sample approval', 'Inspection', 'Merchandising', 'Merchandising Head', 'exf', -10, 2, 'top_sample'],
  ['fabric_booking', 'Fabric booking / PO', 'Materials', 'Store', 'Store Manager', 'order', 5, 2, 'fabric_po'],
  ['fabric_in', 'Fabric in-house', 'Materials', 'Store', 'Store Manager', 'exf', -45, 1, 'fabric_in'],
  ['trims_in', 'Trims & accessories in-house', 'Materials', 'Store', 'Store Manager', 'exf', -35, 1, 'trims_in'],
  ['pp_meeting', 'PP meeting', 'Cutting', 'Production', 'Production Manager', 'exf', -32, 1, ''],
  ['cutting_start', 'Cutting start', 'Cutting', 'Production', 'Production Manager', 'exf', -30, 1, 'cutting_start'],
  ['cutting_complete', 'Cutting complete', 'Cutting', 'Production', 'Production Manager', 'exf', -24, 1, 'cutting_complete'],
  ['stitching_start', 'Stitching start', 'Stitching', 'Production', 'Production Manager', 'exf', -26, 1, 'stitching_start'],
  ['stitching_complete', 'Stitching complete', 'Stitching', 'Production', 'Production Manager', 'exf', -12, 1, 'stitching_complete'],
  ['finishing', 'Washing / finishing', 'Finishing', 'Production', 'Production Manager', 'exf', -8, 3, 'finishing_complete'],
  ['packing', 'Packing', 'Packing', 'Production', 'Production Manager', 'exf', -4, 3, 'packing_complete'],
  ['final_inspection', 'Final inspection (AQL)', 'Inspection', 'Quality', 'Production Manager', 'exf', -2, 1, 'final_inspection'],
  ['ex_factory', 'Ex-factory', 'Dispatch', 'Merchandising', 'Merchandising Head', 'exf', 0, 1, 'ex_factory'],
  ['dispatch', 'Dispatch', 'Dispatch', 'Accounts', 'Accounts', 'exf', 1, 1, 'dispatch'],
  ['docs_bank', 'Documents to bank', 'Dispatch', 'Accounts', 'Accounts', 'exf', 5, 2, 'docs_bank'],
  ['payment_due', 'Payment due', 'Payment', 'Accounts', 'Accounts', 'exf', 65, 1, 'payment'],
].map(([key, activity, stage, dept, ownerRole, anchor, offsetDays, durationDays, sourceEvent]) =>
  ({ key, activity, stage, dept, ownerRole, anchor, offsetDays, durationDays, sourceEvent }));

/** Default pipeline. The live list is configurable (Settings.tnaStages, managed from TNA → Stages); `portal` = shown to the buyer on the tracking page. */
const DEFAULT_STAGES = [
  { name: 'Samples', portal: true }, { name: 'Materials', portal: true }, { name: 'Cutting', portal: true }, { name: 'Stitching', portal: true }, { name: 'Finishing', portal: true },
  { name: 'Packing', portal: true }, { name: 'Inspection', portal: true }, { name: 'Dispatch', portal: true }, { name: 'Payment', portal: false },
];
const STAGES = DEFAULT_STAGES.map((s) => s.name);
/** Validate a stage list: trimmed unique names (case-insensitive), 1–30 chars, 1–20 stages. */
const cleanStages = (list, prev = []) => {
  const ApiError = require('../../common/utils/api-error');
  const prevPortal = Object.fromEntries((prev || []).map((s) => [String(s.name || '').toLowerCase(), s.portal !== false]));
  const out = []; const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const name = String((raw && typeof raw === 'object' ? raw.name : raw) || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    if (name.length > 30) throw ApiError.badRequest(`Stage name "${name.slice(0, 30)}…" is too long (max 30 characters)`);
    if (seen.has(name.toLowerCase())) throw ApiError.badRequest(`Stage "${name}" appears twice`);
    seen.add(name.toLowerCase());
    out.push({ name, portal: raw && typeof raw === 'object' && raw.portal !== undefined ? !!raw.portal : (prevPortal[name.toLowerCase()] ?? true) });
  }
  if (!out.length) throw ApiError.badRequest('At least one stage is required');
  if (out.length > 20) throw ApiError.badRequest('Keep the pipeline to 20 stages or fewer');
  return out;
};
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];

const itemSchema = new mongoose.Schema({
  key: String, activity: { type: String, required: true }, stage: { type: String, default: 'Samples' },   // validated against Settings.tnaStages in the service
  dept: { type: String, default: '' }, ownerRole: { type: String, default: '' },
  anchor: { type: String, enum: ['order', 'exf'], default: 'exf' }, offsetDays: { type: Number, default: 0 }, durationDays: { type: Number, default: 1 },
  sourceEvent: { type: String, default: '' },
}, { _id: false });

/** TNA template — per buyer and/or product type; the default one applies to every new order (FR-19.1). */
const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer' },
    buyerAlias: { type: String, default: '' },
    productType: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    items: [itemSchema],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

/** TNA task — one per activity per order. Dates are editable (= replan, audited); actuals auto-fill from events (FR-19.2/3). */
const taskSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNo: { type: String, default: '' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer' },
    buyerBrand: { type: String, default: '' },
    buyerAlias: { type: String, default: '' },
    styleNo: { type: String, default: '' },
    seq: { type: Number, default: 0 },
    key: { type: String, default: '' },
    activity: { type: String, required: true },
    stage: { type: String, default: 'Samples' },
    dept: { type: String, default: '' },
    ownerUid: { type: String, default: '', index: true },
    ownerName: { type: String, default: '' },
    plannedStart: { type: Date, required: true },
    plannedEnd: { type: Date, required: true, index: true },
    actualStart: { type: Date },
    actualEnd: { type: Date },
    status: { type: String, enum: ['Pending', 'In Progress', 'Done'], default: 'Pending' },
    priority: { type: String, enum: PRIORITIES, default: 'Normal' },
    replanCount: { type: Number, default: 0 },
    replans: [{ at: { type: Date, default: Date.now }, by: String, reason: String, from: Object, to: Object }],
    sourceEvent: { type: String, default: '' },
    remark: { type: String, default: '' },
    templateName: { type: String, default: '' },
  },
  { timestamps: true },
);
taskSchema.index({ orderId: 1, key: 1 });

module.exports = {
  TnaTemplate: mongoose.model('TnaTemplate', templateSchema),
  TnaTask: mongoose.model('TnaTask', taskSchema),
  ACTIVITIES, STAGES, DEFAULT_STAGES, PRIORITIES, cleanStages,
};
