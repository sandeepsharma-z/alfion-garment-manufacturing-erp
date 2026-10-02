const router = require('express').Router();
const mongoose = require('mongoose');
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const audit = require('../audit/audit.service');
const { FORMS, TYPES, cleanFormFields, cleanOverrides } = require('../../common/utils/custom-fields');

const DEFAULT_SIZE_SETS = [
  { name: 'S – 3XL', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'] }, { name: 'XS – XL', sizes: ['XS', 'S', 'M', 'L', 'XL'] },
  { name: 'Japan M – 3L', sizes: ['M', 'L', 'LL', '3L'] }, { name: 'Japan S – LL', sizes: ['S', 'M', 'L', 'LL'] }, { name: 'Free size', sizes: ['F'] },
  { name: 'Kids 2 – 10Y', sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10Y'] }, { name: 'Numeric 34 – 44', sizes: ['34', '36', '38', '40', '42', '44'] },
];
const DEFAULT_FORMATS = { fabricInspection: 'AFN/10', cuttingReport: 'AFN/11', bladeRegister: 'AFN/13', stitchingWip: 'AFN/14', loadingPlan: 'AFN/15', needleRegister: 'AFN/17',
  invoice: 'AFN/19', packingList: 'AFN/19A', finalInspection: 'AFN/21', measurementInspection: 'AFN/22', hourlyOutput: 'AFN/40', specSheet: 'AFN/05', measurementSheet: 'AFN/06' };
const DEFAULT_APPROVALS = ['Proto Sample', 'Fit Sample', 'Size Set', 'Lab dip', 'Print strike-off', 'Embroidery mock-up', 'Wash strike-off', 'Shade band', 'Trim card', 'FPT (fabric test)', 'GPT (garment test)',
  'PP Sample', 'Exhibition Sample', 'Salesman Sample', 'Photoshoot Sample', 'SMS (1st of bulk)', 'TOP Sample'];

/** Singleton company / export setup — printed on every generated document. */
const Setting = mongoose.model('Setting', new mongoose.Schema({
  key: { type: String, unique: true },
  legalName: { type: String, default: 'Afion International Pvt. Ltd.' },
  iec: { type: String, default: '' },
  gstin: { type: String, default: '' },
  currency: { type: String, default: 'INR' },
  defaultPort: { type: String, default: 'Nhava Sheva (INNSA1)' },
  financialYear: { type: String, default: '2026-27' },
  address: { type: String, default: 'Plot 12, Sector 37, Pace City II, Gurgaon 122001, Haryana, India' },
  adCode: { type: String, default: '' },                 // bank AD code — printed on the invoice / shipping bill
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  letterheadFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
  poApprovalLimit: { type: Number, default: 500000 },   // Rs — POs above this wait for po.approve (FR-7.1); 0 = off
  godowns: { type: [String], default: ['Rack A', 'Rack B', 'Rack C', 'Bin D', 'Bin E', 'Yard F', 'Unit 2 — Greater Noida'] },
  lines: { type: [String], default: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7', 'Line 8', 'Cutting Table 1', 'Cutting Table 2', 'Packing Hall'] },
  lineTarget: { type: Number, default: 800 },           // pcs / line / day — efficiency = output ÷ target (FR-11.3)
  tnaAmberDays: { type: Number, default: 3 },           // TNA amber window (FR-19.4)
  tnaAutoApply: { type: Boolean, default: true },       // apply the default TNA template to every new order
  dhuLimit: { type: Number, default: 5 },               // % — DHU above this raises a quality alert
  fabricPointsLimit: { type: Number, default: 20 },     // points / 100 sq m accepted (client format AFN 10)
  aqlLevel: { type: String, default: '2.5' },
  sampleWaitDays: { type: Number, default: 7 },         // sample with buyer longer than this → alert
  escalateHours: { type: Number, default: 24 },         // red alert unacknowledged → escalate to admin (FR-23.5)
  defects: { type: [{ code: String, name: String, severity: String }], default: [] },   // defect master (empty = built-in list)
  complianceReminderDays: { type: [Number], default: [60, 30, 15, 7, 1] },   // reminder offsets before expiry (FR-21.3)
  invoicePrefix: { type: String, default: 'AFI/EXP' },
  defaultPortOfDischarge: { type: String, default: '' },
  portalBaseUrl: { type: String, default: '' },        // public origin of the ERP — tracking links = <base>/track/CODE (empty = first CORS origin)
  portalDefaultDays: { type: Number, default: 90 },     // tracking link validity
  sizeSets: { type: [{ name: String, sizes: [String] }], default: () => DEFAULT_SIZE_SETS },   // configurable size runs (orders / POM)
  cutExtraPct: { type: Number, default: 5 },            // cutting qty = order qty + this %
  defaultCurrency: { type: String, default: 'USD' },    // buyer order pricing currency
  fxRate: { type: Number, default: 83 },                // ₹ per unit of the default currency (invoice / order INR values)
  igstPct: { type: Number, default: 5 },                // IGST % on export invoice (0 under LUT)
  formatNos: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...DEFAULT_FORMATS }) },   // client format numbers printed on documents
  approvalItems: { type: [String], default: () => DEFAULT_APPROVALS },   // approvals board rows per style
  sampleFields: { type: Array, default: [] },            // legacy (migrated into formFields.samples on first read)
  formFields: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields: { [formKey]: [{ key, label, type, options, required, placeholder, hint }] }
  fieldOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  tnaStages: { type: [{ name: String, portal: { type: Boolean, default: true } }], default: () => require('../tna/tna.model').DEFAULT_STAGES },   // TNA pipeline (TNA → Stages)   // built-in field tweaks: { [formKey]: { [builtinKey]: { label, placeholder, hint, required, hidden } } }
}, { timestamps: true }));

const getCompany = async () => {
  const doc = (await Setting.findOne({ key: 'company' })) || (await Setting.create({ key: 'company' }));
  if (Array.isArray(doc.sampleFields) && doc.sampleFields.length && !(doc.formFields && doc.formFields.samples)) {   // one-time migration
    doc.formFields = { ...(doc.formFields || {}), samples: doc.sampleFields }; doc.sampleFields = []; doc.markModified('formFields'); await doc.save();
  }
  return doc;
};

router.use(authenticate);
router.get('/company', catchAsync(async (req, res) => res.json((await getCompany()).toObject())));
router.get('/forms', (req, res) => res.json({ forms: FORMS, types: TYPES }));   // registry of forms (built-in fields) + field types for extra fields
/* the client's possible materials / accessories by category — the same list everywhere in the software */
router.get('/material-catalog', (req, res) => { const c = require('../../common/utils/material-catalog'); res.json({ catalog: c.CATALOG, items: c.ITEMS }); });
router.put('/company', requireModule('settings'), catchAsync(async (req, res) => {
  const doc = await getCompany();
  const before = doc.toObject();
  ['legalName', 'iec', 'gstin', 'currency', 'defaultPort', 'financialYear', 'address', 'phone', 'email', 'letterheadFileId', 'poApprovalLimit', 'godowns', 'lines', 'lineTarget', 'tnaAmberDays', 'tnaAutoApply', 'dhuLimit', 'fabricPointsLimit', 'aqlLevel', 'sampleWaitDays', 'escalateHours', 'defects', 'complianceReminderDays', 'invoicePrefix', 'defaultPortOfDischarge', 'portalBaseUrl', 'portalDefaultDays', 'adCode', 'sizeSets', 'cutExtraPct', 'defaultCurrency', 'fxRate', 'igstPct', 'formatNos', 'approvalItems']
    .forEach((k) => { if (req.body[k] !== undefined) doc.set(k, req.body[k]); });
  if (req.body.formFields !== undefined) { doc.set('formFields', cleanFormFields(req.body.formFields)); doc.markModified('formFields'); }
  if (req.body.fieldOverrides !== undefined) { doc.set('fieldOverrides', cleanOverrides(req.body.fieldOverrides)); doc.markModified('fieldOverrides'); }
  // tnaStages is deliberately NOT writable here — PUT /tna/stages carries the tna.edit gate and the rename / move handling
  await doc.save();
  audit.record(req, 'settings.company', 'Setting:company', before, doc.toObject());
  res.json(doc.toObject());
}));

module.exports = router;
module.exports.getCompany = getCompany;
module.exports.DEFAULT_SIZE_SETS = DEFAULT_SIZE_SETS;
module.exports.DEFAULT_FORMATS = DEFAULT_FORMATS;
module.exports.DEFAULT_APPROVALS = DEFAULT_APPROVALS;
