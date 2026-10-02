const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const { plain, buyerLabel } = require('../../common/utils/mask');
const audit = require('../audit/audit.service');
const Material = require('../materials/material.model');
const Order = require('../orders/order.model');
const Bom = require('../bom/bom.model');
const { ProductionOp, ProductionLog } = require('../production/production.model');
const stock = require('../stock/stock.service');

router.use(authenticate, requireModule('packing'));

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/**
 * GET /packing/overview — packing material check (FR-13.1) + carton plan by open order (M-13).
 * required = Σ over orders not yet packed of ceil(perPc × qty × (1 + waste%)) for Packing-category BOM lines.
 */
router.get('/overview', catchAsync(async (req, res) => {
  const showRate = hasFlag(req.user, 'rates.view');
  const orders = await Order.find({ status: 'Open' }).sort('shipDate');
  const ops = await ProductionOp.find({ orderId: { $in: orders.map((o) => o._id) }, op: 'Packing' });
  const opBy = Object.fromEntries(ops.map((o) => [String(o.orderId), o]));
  const boms = await Bom.find({ styleId: { $in: orders.map((o) => o.styleId).filter(Boolean) } });
  const bomBy = Object.fromEntries(boms.map((b) => [String(b.styleId), b]));
  const mats = await Material.find({ category: 'Packing', status: 'Active' }).sort('code');
  const onOrder = await stock.onOrderMap();

  const required = {};      // materialId → qty across orders still to pack
  const plans = [];
  for (const o of orders) {
    const op = opBy[String(o._id)];
    const packed = op ? Math.min(op.doneQty, op.plannedQty) : 0;
    const toPack = Math.max(o.qty - packed, 0);
    const bom = bomBy[String(o.styleId)];
    const lines = bom ? bom.lines.filter((l) => /^PKG/i.test(l.materialCode || '') || mats.some((m) => String(m._id) === String(l.materialId))) : [];
    lines.forEach((l) => { required[String(l.materialId)] = (required[String(l.materialId)] || 0) + Math.ceil(l.perPc * toPack * (1 + (l.wastePct || 0) / 100)); });
    const short = lines.filter((l) => { const m = mats.find((x) => String(x._id) === String(l.materialId)); return m && (m.physicalQty - m.reservedQty) < Math.ceil(l.perPc * toPack * (1 + (l.wastePct || 0) / 100)); });
    const state = op && op.blocked ? 'Blocked' : !op || op.doneQty <= 0 ? (short.length ? 'Blocked' : 'Queued') : op.doneQty >= op.plannedQty ? 'Completed' : 'In Progress';
    plans.push({
      orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, buyerName: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), qty: o.qty, shipDate: o.shipDate, priority: o.priority,
      packRatio: o.packRatio || '', pcsPerCarton: o.pcsPerCarton || 0, cartons: o.pcsPerCarton ? Math.ceil(o.qty / o.pcsPerCarton) : 0,
      packed, toPack, status: state, shortLines: short.map((l) => l.materialCode), packingLines: lines.length,
      colours: ((o.colours || []).map((c) => c.name || c.code).filter(Boolean).length ? o.colours.map((c) => c.name || c.code) : [o.colour]).filter(Boolean), sizeSet: o.sizeSet || [],
    });
  }
  const items = mats.map((m) => {
    const req = required[String(m._id)] || 0;
    const balance = m.physicalQty - m.reservedQty - req;
    const o = plain(m);
    o.freeQty = m.physicalQty - m.reservedQty; o.required = req; o.balance = balance; o.onOrder = (onOrder[String(m._id)] || { qty: 0 }).qty;
    o.status = balance < 0 ? 'Reorder Now' : 'Sufficient';
    if (!showRate) delete o.rate;
    return o;
  });
  const carton = mats.find((m) => /carton/i.test(m.name));
  const packedToday = await ProductionLog.find({ op: 'Packing', date: { $gte: startOfToday() } });
  res.json({
    items, plans,
    kpi: {
      cartonsInStock: carton ? carton.physicalQty : 0, cartonsReserved: carton ? carton.reservedQty : 0,
      shortfalls: items.filter((i) => i.balance < 0).map((i) => `${i.name} — ${Math.abs(i.balance).toLocaleString('en-IN')} ${i.uom} short`),
      cartonsToBuild: plans.filter((p) => p.status !== 'Completed').reduce((a, p) => a + Math.ceil(p.toPack / (p.pcsPerCarton || 1)) * (p.pcsPerCarton ? 1 : 0), 0),
      packedToday: packedToday.reduce((a, l) => a + l.output, 0), packedTodayOrders: [...new Set(packedToday.map((l) => l.orderNo))],
    },
  });
}));

/** PUT /packing/plan/:orderId { packRatio, pcsPerCarton } */
router.put('/plan/:orderId', catchAsync(async (req, res) => {
  const o = await Order.findById(req.params.orderId);
  if (!o) throw ApiError.notFound('Order not found');
  const before = { packRatio: o.packRatio, pcsPerCarton: o.pcsPerCarton };
  if (req.body.packRatio !== undefined) o.packRatio = String(req.body.packRatio);
  if (req.body.pcsPerCarton !== undefined) o.pcsPerCarton = Math.max(parseInt(req.body.pcsPerCarton, 10) || 0, 0);
  await o.save();
  audit.record(req, 'packing.plan', `Order:${o.orderNo}`, before, { packRatio: o.packRatio, pcsPerCarton: o.pcsPerCarton });
  res.json({ orderNo: o.orderNo, packRatio: o.packRatio, pcsPerCarton: o.pcsPerCarton, cartons: o.pcsPerCarton ? Math.ceil(o.qty / o.pcsPerCarton) : 0 });
}));

/** GET /packing/list-data/:orderId — what the printable packing list needs (frontend renders + prints). */
router.get('/list-data/:orderId', catchAsync(async (req, res) => {
  const o = await Order.findById(req.params.orderId);
  if (!o) throw ApiError.notFound('Order not found');
  const { getCompany } = require('../settings/settings.routes');
  const per = o.pcsPerCarton || 0;
  const cartons = per ? Math.ceil(o.qty / per) : 0;
  /* ponytail: sizes spread evenly across cartons by their % — real carton-wise assortment arrives with dispatch (P5) */
  const perCarton = per ? o.sizes.map((s) => ({ size: s.size, qty: Math.round(per * s.pct / 100) })) : [];
  res.json({
    order: { orderNo: o.orderNo, styleNo: o.styleNo, description: o.description, buyerName: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), buyerPoNo: o.buyerPoNo,
      qty: o.qty, sizes: o.sizes, sizeSet: o.sizeSet, colours: o.colours, packRatio: o.packRatio, pcsPerCarton: per, cartons, mode: o.mode, shipDate: o.shipDate, colour: o.colour },
    perCarton, company: (await getCompany()).toObject(),
  });
}));

/** POST /packing/log/:orderId { output, colour, note } — packing is logged here, not on the production floor. */
router.post('/log/:orderId', catchAsync(async (req, res) => {
  const b = req.body || {};
  /* never pack more than the order — the form caps it too, this is the hard stop */
  const o = await Order.findById(req.params.orderId);
  if (!o) throw ApiError.notFound('Order not found');
  const op = await ProductionOp.findOne({ orderId: o._id, op: 'Packing' });
  const left = Math.max((op ? op.plannedQty : o.qty) - (op ? op.doneQty : 0), 0);
  if (Math.round(+b.output || 0) > left) throw ApiError.badRequest(`Only ${left.toLocaleString('en-IN')} pcs are left to pack on ${o.orderNo}`);
  const out = await require('../production/production.service').addLog(req, { ...b, orderId: req.params.orderId, op: 'Packing' });
  res.status(201).json(out);
}));

module.exports = router;
