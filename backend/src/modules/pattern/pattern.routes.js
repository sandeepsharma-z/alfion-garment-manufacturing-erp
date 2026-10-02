const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule, requireFlag } = require('../../common/middleware/auth');
const crud = require('../../common/utils/crud');
const crudRoutes = require('../../common/utils/crud-routes');
const { plain, buyerLabel } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const audit = require('../audit/audit.service');
const Pattern = require('./pattern.model');
const Style = require('../styles/style.model');
const Sample = require('../samples/sample.model');
const Order = require('../orders/order.model');
const File = require('../files/file.model');
const User = require('../users/user.model');

const present = (doc, user) => {
  const p = plain(doc);
  p.buyerName = buyerLabel(user, p.buyerBrand, p.buyerAlias);
  p.currentVersion = p.versions.length ? p.versions[p.versions.length - 1] : null;
  p.overdue = p.status !== 'Approved' && p.status !== 'Superseded' && !!p.dueDate && new Date(p.dueDate).getTime() < Date.now();
  return p;
};

const svc = crud(Pattern, {
  label: 'pattern',
  form: 'patterns',
  search: ['patternNo', 'styleNo', 'buyerBrand', 'buyerAlias', 'makerName'],
  filters: ['status', 'styleId', 'buyerId', 'priority', 'gradingStatus'],
  present,
  beforeCreate: async (body, req) => {
    const style = await Style.findById(body.styleId);
    if (!style) throw ApiError.badRequest('Style is required');
    const sample = body.sampleId ? await Sample.findById(body.sampleId) : null;
    const maker = body.makerUid ? await User.findOne({ uid: body.makerUid }) : null;
    const { patternNo, versions, issues, status, approvedBy, approvedAt, ...rest } = body;
    return { ...rest, patternNo: `PT-${pad(await nextSeq('pattern'), 4)}`, styleId: style._id, styleNo: style.styleNo,
      buyerId: style.buyerId, buyerBrand: style.buyerBrand, buyerAlias: style.buyerAlias,
      makerUid: maker ? maker.uid : req.user.uid, makerName: maker ? maker.name : (body.makerName || req.user.name),
      sampleId: sample ? sample._id : undefined, sampleNo: sample ? sample.sampleNo : '', sampleRound: sample ? sample.round : 0,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined, createdBy: req.user.uid };
  },
  beforeUpdate: async (body, req, doc) => {
    if (doc.status === 'Superseded') throw ApiError.badRequest('A superseded pattern cannot be edited');
    const { patternNo, versions, issues, status, approvedBy, approvedAt, styleId, styleNo, buyerId, buyerBrand, buyerAlias, ...rest } = body;
    if (rest.makerUid) { const u = await User.findOne({ uid: rest.makerUid }); if (u) rest.makerName = u.name; }
    return rest;
  },
});

router.use(authenticate, requireModule('pattern'));
router.get('/meta', (req, res) => res.json({ statuses: Pattern.STATUSES, baseSizes: ['XS', 'S', 'M', 'L', 'XL'] }));

/** POST /patterns/:id/version { fileId, note } — DXF/PLT/PDF/image, v1…vN (FR-18.2) */
router.post('/:id/version', catchAsync(async (req, res) => {
  const p = await Pattern.findById(req.params.id);
  if (!p) throw ApiError.notFound('Pattern not found');
  if (p.status === 'Superseded') throw ApiError.badRequest('A superseded pattern cannot take new versions');
  const f = await File.findById((req.body || {}).fileId);
  if (!f) throw ApiError.badRequest('Upload the file first');
  if (!/\.(dxf|plt|pdf|png|jpe?g|webp)$/i.test(f.name)) throw ApiError.badRequest('Pattern files must be DXF, PLT, PDF or images');
  p.versions.push({ version: p.versions.length + 1, fileId: f._id, fileName: f.name, kind: f.name.split('.').pop().toUpperCase(), note: (req.body || {}).note || '', by: req.user.name });
  if (p.status === 'Approved') { p.status = 'In Review'; p.reviewNote = 'New version uploaded — re-approval needed'; }
  await p.save();
  audit.record(req, 'pattern.version', `Pattern:${p.patternNo}`, null, { version: p.versions.length, file: f.name });
  res.json(present(p, req.user));
}));

/** Draft → In Review */
router.post('/:id/submit', catchAsync(async (req, res) => {
  const p = await Pattern.findById(req.params.id);
  if (!p) throw ApiError.notFound('Pattern not found');
  if (!p.versions.length) throw ApiError.badRequest('Attach at least one pattern file before submitting for review');
  if (p.status !== 'Draft') throw ApiError.badRequest(`${p.patternNo} is ${p.status}`);
  p.status = 'In Review'; p.reviewNote = (req.body || {}).note || '';
  await p.save();
  audit.record(req, 'pattern.submit', `Pattern:${p.patternNo}`);
  res.json(present(p, req.user));
}));

/** In Review → Approved (needs pattern.approve); TNA "pattern approval" auto-completes for this style's open orders (FR-18.3/4) */
router.post('/:id/approve', requireFlag('pattern.approve'), catchAsync(async (req, res) => {
  const p = await Pattern.findById(req.params.id);
  if (!p) throw ApiError.notFound('Pattern not found');
  if (p.status !== 'In Review') throw ApiError.badRequest(`${p.patternNo} is not in review`);
  p.status = 'Approved'; p.approvedBy = req.user.name; p.approvedAt = new Date(); p.reviewNote = (req.body || {}).note || '';
  await p.save();
  await Pattern.updateMany({ styleId: p.styleId, status: 'Approved', _id: { $ne: p._id } }, { $set: { status: 'Superseded', supersededBy: p._id } });
  const tna = require('../tna/tna.service');
  for (const o of await Order.find({ styleId: p.styleId, status: 'Open' })) await tna.markEvent(o._id, 'pattern', new Date(), `pattern ${p.patternNo}`);
  audit.record(req, 'pattern.approve', `Pattern:${p.patternNo}`, null, { version: p.versions.length });
  res.json(present(p, req.user));
}));

router.post('/:id/reject', requireFlag('pattern.approve'), catchAsync(async (req, res) => {
  const p = await Pattern.findById(req.params.id);
  if (!p) throw ApiError.notFound('Pattern not found');
  if (p.status !== 'In Review') throw ApiError.badRequest(`${p.patternNo} is not in review`);
  const note = (req.body || {}).note;
  if (!note) throw ApiError.badRequest('Give the maker a reason');
  p.status = 'Draft'; p.reviewNote = note;
  await p.save();
  audit.record(req, 'pattern.reject', `Pattern:${p.patternNo}`, null, { note });
  res.json(present(p, req.user));
}));

/** Issue an approved pattern to cutting for an order — who took which version when (FR-18.3) */
router.post('/:id/issue', catchAsync(async (req, res) => {
  const p = await Pattern.findById(req.params.id);
  if (!p) throw ApiError.notFound('Pattern not found');
  if (p.status !== 'Approved') throw ApiError.badRequest('Only an approved pattern can be issued to cutting');
  const b = req.body || {};
  const order = b.orderId ? await Order.findById(b.orderId) : null;
  p.issues.push({ version: p.versions.length, orderId: order ? order._id : undefined, orderNo: order ? order.orderNo : '', issuedTo: b.issuedTo || 'Cutting', by: req.user.name });
  await p.save();
  if (order) await Order.updateOne({ _id: order._id }, { $push: { activity: { by: req.user.name, text: `Pattern ${p.patternNo} v${p.versions.length} issued to ${b.issuedTo || 'cutting'}` } } });
  audit.record(req, 'pattern.issue', `Pattern:${p.patternNo}`, null, { version: p.versions.length, order: order ? order.orderNo : '', issuedTo: b.issuedTo });
  res.json(present(p, req.user));
}));

router.get('/summary', catchAsync(async (req, res) => {
  const all = await Pattern.find({ status: { $ne: 'Superseded' } });
  res.json({ total: all.length, inReview: all.filter((p) => p.status === 'In Review').length, approved: all.filter((p) => p.status === 'Approved').length,
    draft: all.filter((p) => p.status === 'Draft').length, overdue: all.filter((p) => p.status !== 'Approved' && p.dueDate && p.dueDate.getTime() < Date.now()).map((p) => p.patternNo) });
}));

crudRoutes(router, svc);
module.exports = router;
