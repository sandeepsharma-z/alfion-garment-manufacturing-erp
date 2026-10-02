const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const { plain } = require('../../common/utils/mask');
const audit = require('../audit/audit.service');
const svc = require('./tna.service');
const { TnaTemplate, ACTIVITIES, PRIORITIES } = require('./tna.model');
const Order = require('../orders/order.model');
const Buyer = require('../buyers/buyer.model');

router.use(authenticate);

/* task endpoints are open to every signed-in user (My Work needs them); templates / board / apply need the tna module */
router.get('/tasks', catchAsync(async (req, res) => res.json(await svc.list(req, req.query))));
router.patch('/tasks/:id', catchAsync(async (req, res) => res.json(await svc.update(req, req.params.id, req.body || {}))));
router.post('/tasks/:id/complete', catchAsync(async (req, res) => res.json(await svc.complete(req, req.params.id, req.body || {}))));
router.post('/tasks/:id/reopen', catchAsync(async (req, res) => res.json(await svc.reopen(req, req.params.id))));
router.get('/orders/:orderId', catchAsync(async (req, res) => res.json(await svc.forOrder(req, req.params.orderId))));
router.get('/stages', catchAsync(async (req, res) => res.json(await svc.getStages())));   // pipeline definition — readable by everyone signed in (order page, portal share card)

router.use(requireModule('tna'));
router.get('/meta', catchAsync(async (req, res) => res.json({ activities: svc.defaultItems(await svc.stageNames()), stages: await svc.stageNames(), priorities: PRIORITIES })));
router.put('/stages', catchAsync(async (req, res) => {
  if (!(req.user.role === 'Admin' || hasFlag(req.user, 'tna.edit'))) throw ApiError.forbidden('Changing the pipeline needs the tna.edit flag');
  res.json(await svc.setStages(req, req.body || {}));
}));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req))));
/* the whole plan (or one order's) as the buyer's Excel T&A sheet — planned row + actual row per order */
router.get('/export', catchAsync(async (req, res) => {
  const out = await require('./tna.export').excel(req, req.query.orderId || '');
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${out.name}"`);
  res.send(out.html);
}));
router.get('/board', catchAsync(async (req, res) => res.json(await svc.board(req))));
router.post('/orders/:orderId/apply', catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw ApiError.notFound('Order not found');
  const created = await svc.applyTemplate(req, order, (req.body || {}).templateId, !!(req.body || {}).force);
  res.status(201).json({ created: created.length, template: created.length ? created[0].templateName : '' });
}));

/* ---- templates ---- */
router.get('/templates', catchAsync(async (req, res) => {
  const rows = await TnaTemplate.find().sort('-isDefault name');
  res.json({ items: rows.map(plain), total: rows.length });
}));
router.post('/templates', catchAsync(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw ApiError.badRequest('Template name is required');
  const buyer = b.buyerId ? await Buyer.findById(b.buyerId) : null;
  const items = Array.isArray(b.items) && b.items.length ? b.items : svc.defaultItems(await svc.stageNames());
  if (b.isDefault) await TnaTemplate.updateMany({}, { $set: { isDefault: false } });
  const doc = await TnaTemplate.create({ name: b.name, buyerId: buyer ? buyer._id : undefined, buyerAlias: buyer ? buyer.alias : '', productType: b.productType || '',
    isDefault: !!b.isDefault, items, updatedBy: req.user.uid });
  audit.record(req, 'tna.template.create', `TnaTemplate:${doc.name}`, null, { items: items.length });
  res.status(201).json(plain(doc));
}));
router.patch('/templates/:id', catchAsync(async (req, res) => {
  const doc = await TnaTemplate.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Template not found');
  const before = doc.toObject();
  const b = req.body || {};
  if (b.name) doc.name = b.name;
  if (b.productType !== undefined) doc.productType = b.productType;
  if (b.buyerId !== undefined) { const buyer = b.buyerId ? await Buyer.findById(b.buyerId) : null; doc.buyerId = buyer ? buyer._id : undefined; doc.buyerAlias = buyer ? buyer.alias : ''; }
  if (Array.isArray(b.items)) doc.items = b.items;
  if (b.status) doc.status = b.status;
  if (b.isDefault) { await TnaTemplate.updateMany({ _id: { $ne: doc._id } }, { $set: { isDefault: false } }); doc.isDefault = true; }
  doc.updatedBy = req.user.uid;
  await doc.save();
  audit.record(req, 'tna.template.update', `TnaTemplate:${doc.name}`, before, doc.toObject());
  res.json(plain(doc));
}));

module.exports = router;
