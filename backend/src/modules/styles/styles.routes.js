const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const audit = require('../audit/audit.service');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const crud = require('../../common/utils/crud');
const crudRoutes = require('../../common/utils/crud-routes');
const { plain, buyerLabel } = require('../../common/utils/mask');
const Style = require('./style.model');
const Buyer = require('../buyers/buyer.model');

const present = (doc, user) => {
  const s = plain(doc);
  s.buyerName = buyerLabel(user, s.buyerBrand, s.buyerAlias);
  return s;
};

/* denormalise buyer brand/alias so lists never need a join */
const withBuyer = async (body) => {
  if (!body.buyerId) return body;
  const b = await Buyer.findById(body.buyerId);
  return b ? { ...body, buyerBrand: b.brand, buyerAlias: b.alias } : body;
};

const svc = crud(Style, {
  label: 'style',
  search: ['styleNo', 'description', 'buyerBrand', 'productType'],
  filters: ['status', 'buyerId'],
  sort: '-createdAt',
  present,
  beforeCreate: withBuyer,
  beforeUpdate: withBuyer,
});

router.use(authenticate, requireModule('samples'));

const APPROVAL_STATUS = ['Pending', 'Received', 'Submitted', 'Approved', 'Rejected', 'Resubmit'];
/* approval title → TNA source event, so an approval on the board completes the matching T&A activity of the style's open orders */
const TNA_EVENT = { 'lab dip': 'lab_dip', 'print strike-off': 'strike_off', 'embroidery mock-up': 'strike_off', 'wash strike-off': 'strike_off', 'trim card': 'trim_card', 'pp sample': 'pp_sample', 'size set': 'size_set', 'top sample': 'top_sample', 'fit sample': 'fit_sample' };
const cleanSizes = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,/]/)).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20);
const num = (v) => (v === '' || v === undefined || v === null || Number.isNaN(+v) ? undefined : Math.round(+v * 100) / 100);
const date = (v) => (v ? new Date(v) : undefined);

/** PUT /styles/:id/pom { sizeSet, pomUnit, pom: [{ code, name, tolerance, spec: { size: value } }] } — measurement spec per size */
router.put('/:id/pom', catchAsync(async (req, res) => {
  const style = await Style.findById(req.params.id);
  if (!style) throw ApiError.notFound('Style not found');
  const sizeSet = cleanSizes(req.body.sizeSet !== undefined ? req.body.sizeSet : style.sizeSet);
  const pom = (Array.isArray(req.body.pom) ? req.body.pom : []).filter((r) => r && String(r.name || r.code || '').trim()).map((r, i) => {
    const spec = {}; sizeSet.forEach((s) => { const v = num(r.spec && r.spec[s]); if (v !== undefined) spec[s] = v; });
    return { code: String(r.code || String.fromCharCode(65 + (i % 26))).trim(), name: String(r.name || '').trim(), tolerance: num(r.tolerance) ?? 0.5, spec };
  });
  const dupe = pom.map((r) => r.code.toUpperCase()).find((c, i, arr) => arr.indexOf(c) !== i);
  if (dupe) throw ApiError.badRequest(`POM code ${dupe} is used twice — give each point of measure its own code`);
  style.sizeSet = sizeSet; style.pom = pom; if (['cm', 'in'].includes(req.body.pomUnit)) style.pomUnit = req.body.pomUnit; style.markModified('pom');
  await style.save();
  audit.record(req, 'style.pom', `Style:${style.styleNo}`, null, { rows: pom.length, sizes: sizeSet });
  res.json(present(style, req.user));
}));

/** PUT /styles/:id/techpack — composition / lining / article / construction / label placement / packing / accessory list */
router.put('/:id/techpack', catchAsync(async (req, res) => {
  const style = await Style.findById(req.params.id);
  if (!style) throw ApiError.notFound('Style not found');
  const t = req.body || {};
  style.techPack = { composition: String(t.composition || ''), lining: String(t.lining || ''), article: String(t.article || ''), construction: String(t.construction || ''), labelPlacement: String(t.labelPlacement || ''), packingMethod: String(t.packingMethod || ''),
    accessories: (Array.isArray(t.accessories) ? t.accessories : []).filter((a) => a && String(a.item || '').trim()).map((a) => ({ item: String(a.item).trim(), qtyPerPc: num(a.qtyPerPc) ?? 1, note: String(a.note || '') })) };
  await style.save();
  audit.record(req, 'style.techpack', `Style:${style.styleNo}`, null, style.techPack);
  res.json(present(style, req.user));
}));

/** GET /styles/:id/approvals — the board (defaults from Settings when empty) · PUT replaces it; Approved rows fire the TNA event on the style's open orders */
router.get('/:id/approvals', catchAsync(async (req, res) => {
  const style = await Style.findById(req.params.id);
  if (!style) throw ApiError.notFound('Style not found');
  const cfg = (await require('../settings/settings.routes').getCompany()).toObject();
  const rows = style.approvals.length ? style.approvals : (cfg.approvalItems || []).map((title) => ({ title, group: /sample|sms|top/i.test(title) ? 'Sample' : 'Approval', status: 'Pending' }));
  res.json({ styleNo: style.styleNo, items: rows, statuses: APPROVAL_STATUS, saved: style.approvals.length > 0 });
}));
router.put('/:id/approvals', catchAsync(async (req, res) => {
  const style = await Style.findById(req.params.id);
  if (!style) throw ApiError.notFound('Style not found');
  const before = style.approvals.map((a) => a.toObject());
  const rows = (Array.isArray(req.body.items) ? req.body.items : []).filter((r) => r && String(r.title || '').trim()).map((r) => ({
    title: String(r.title).trim(), group: r.group === 'Sample' ? 'Sample' : 'Approval', dueDate: date(r.dueDate), pcsPerColour: num(r.pcsPerColour), receivedOn: date(r.receivedOn), submittedOn: date(r.submittedOn), awb: String(r.awb || ''),
    approvedOn: date(r.approvedOn), commentsOn: date(r.commentsOn), status: APPROVAL_STATUS.includes(r.status) ? r.status : 'Pending', comment: String(r.comment || ''), by: req.user.name }));
  style.approvals = rows;
  await style.save();
  /* newly approved rows → TNA events for every open order of the style */
  const newly = rows.filter((r) => r.status === 'Approved' && !before.some((b) => b.title === r.title && b.status === 'Approved'));
  if (newly.length) {
    const Order = require('../orders/order.model');
    const tna = require('../tna/tna.service');
    const orders = await Order.find({ styleId: style._id, status: 'Open' }).select('_id');
    for (const r of newly) { const ev = TNA_EVENT[r.title.toLowerCase()]; if (!ev) continue; for (const o of orders) await tna.markEvent(o._id, ev, r.approvedOn || new Date(), `${r.title} approved`); }
  }
  audit.record(req, 'style.approvals', `Style:${style.styleNo}`, { rows: before.length }, { rows: rows.length, approved: rows.filter((r) => r.status === 'Approved').length });
  res.json({ styleNo: style.styleNo, items: style.approvals, statuses: APPROVAL_STATUS, saved: true });
}));

crudRoutes(router, svc);

module.exports = router;
