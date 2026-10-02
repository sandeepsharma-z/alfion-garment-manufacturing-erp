const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const Bom = require('./bom.model');
const Style = require('../styles/style.model');
const Material = require('../materials/material.model');

/**
 * Material planning maths — the authoritative rule set (SRS Part 9):
 *   required  = ceil(perPc × qty × (1 + waste%))
 *   free      = physical − reserved
 *   shortage  = max(required − free, 0)
 *   buyCost   = shortage × rate
 */
const planRows = async (bom, qty, user, order) => {
  const ids = bom.lines.map((l) => l.materialId);
  const mats = await Material.find({ _id: { $in: ids } });
  const onOrder = await require('../stock/stock.service').onOrderMap({ materialId: { $in: ids } });   // every open PO for the material (stock or any order)
  const byId = Object.fromEntries(mats.map((m) => [String(m._id), m]));
  const showRate = hasFlag(user, 'rates.view');
  return bom.lines.map((l) => {
    const m = byId[String(l.materialId)] || { physicalQty: 0, reservedQty: 0, rate: 0 };
    const required = Bom.lineRequired(l, order || { qty, cutQty: qty });
    const free = m.physicalQty - m.reservedQty;
    const shortage = Math.max(required - free, 0);
    const moq = l.moq || m.moq || 0;
    const oo = onOrder[String(l.materialId)] || { qty: 0, count: 0, nos: [] };
    const toOrder = Math.max(shortage - oo.qty, 0);
    return {
      materialId: l.materialId, code: l.materialCode, name: l.materialName, uom: l.uom, category: m.category, itemType: m.itemType || '', part: l.part || '', colour: l.colour || '', perSize: l.perSize || {}, supplierId: m.supplierId, supplierName: m.supplierName || '',
      perPc: l.perPc, wastePct: l.wastePct || 0, required, physical: m.physicalQty,
      reserved: m.reservedQty, free, shortage, moq, onOrder: oo.qty, openPos: oo.count, poNos: oo.nos || [], poEta: oo.eta, toOrder, orderQty: toOrder > 0 ? Math.max(toOrder, moq) : 0, requiredDate: l.requiredDate,
      buyCost: showRate ? Math.round((toOrder > 0 ? Math.max(toOrder, moq) : 0) * (m.rate || 0)) : undefined,
      status: shortage === 0 ? 'In Stock' : toOrder === 0 ? 'On Order' : 'Purchase',
    };
  });
};

router.use(authenticate, requireModule('planning'));

/** GET /bom/:styleId — BOM for a style (empty shell if none yet) */
router.get('/:styleId', catchAsync(async (req, res) => {
  const style = await Style.findById(req.params.styleId);
  if (!style) throw ApiError.notFound('Style not found');
  const bom = await Bom.findOne({ styleId: style._id });
  res.json(bom ? bom.toObject() : { styleId: style._id, styleNo: style.styleNo, version: 0, lines: [] });
}));

/** PUT /bom/:styleId — replace lines (version bumps) */
router.put('/:styleId', catchAsync(async (req, res) => {
  const style = await Style.findById(req.params.styleId);
  if (!style) throw ApiError.notFound('Style not found');
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  if (!lines.length) throw ApiError.badRequest('Add at least one material line');
  const mats = await Material.find({ _id: { $in: lines.map((l) => l.materialId) } });
  const byId = Object.fromEntries(mats.map((m) => [String(m._id), m]));
  const clean = lines.map((l) => {
    const m = byId[String(l.materialId)];
    if (!m) throw ApiError.badRequest('Unknown material in BOM line');
    const perSize = {}; Object.entries(l.perSize && typeof l.perSize === 'object' ? l.perSize : {}).forEach(([k, v]) => { if (+v > 0) perSize[String(k).trim()] = Math.round(+v * 10000) / 10000; });
    return { materialId: m._id, materialCode: m.code, materialName: m.name, uom: m.uom,
      perPc: +l.perPc || 0, wastePct: +l.wastePct || 0, note: l.note || '', part: String(l.part || '').trim(), colour: String(l.colour || '').trim(), perSize,
      moq: Math.max(+l.moq || 0, 0), requiredDate: l.requiredDate ? new Date(l.requiredDate) : undefined };
  });
  const before = await Bom.findOne({ styleId: style._id });
  const bom = await Bom.findOneAndUpdate(
    { styleId: style._id },
    { $set: { styleNo: style.styleNo, lines: clean, updatedBy: req.user.uid }, $inc: { version: 1 } },
    { new: true, upsert: true });
  audit.record(req, 'bom.save', `Style:${style.styleNo}`, before ? before.toObject() : null, bom.toObject());
  res.json(bom.toObject());
}));

/** POST /bom/from-sample/:sampleId — build (or refresh) the style's BOM from the sample's material sheet. */
router.post('/from-sample/:sampleId', catchAsync(async (req, res) => {
  const Sample = require('../samples/sample.model');
  const sample = await Sample.findById(req.params.sampleId);
  res.json(await require('./bom.service').buildFromSample(req, sample, { createMissing: req.body?.createMissing !== false }));
}));

/** POST /bom/calc { styleId, qty } — live requirement / shortage table */
router.post('/calc', catchAsync(async (req, res) => {
  const { styleId, qty, orderId } = req.body || {};
  const q = Math.max(parseInt(qty || 0, 10), 0);
  const bom = await Bom.findOne({ styleId });
  if (!bom) return res.json({ rows: [], qty: q, shortages: 0, totalBuyCost: 0, hasBom: false });
  const order = orderId ? await require('../orders/order.model').findById(orderId) : null;   // colour / size-wise basis when planning for a live order
  const rows = await planRows(bom, q, req.user, order ? order.toObject() : null);
  res.json({
    rows, qty: q, hasBom: true, version: bom.version,
    shortages: rows.filter((r) => r.orderQty > 0).length, onOrderLines: rows.filter((r) => r.shortage > 0 && r.toOrder === 0).length,
    totalBuyCost: rows.reduce((a, r) => a + (r.buyCost || 0), 0),
  });
}));

module.exports = router;
module.exports.planRows = planRows;
