const mongoose = require('mongoose');
const ApiError = require('../../common/utils/api-error');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const { hasFlag } = require('../users/roles');
const Ledger = require('./ledger.model');
const Material = require('../materials/material.model');
const log = logger.child({ context: 'StockService' });

/**
 * The ONLY way balances change from Phase 2 on. Atomic $inc on the material, then the ledger row
 * with the balance after. ponytail: two writes, no transaction — a failed ledger write is logged loudly;
 * move to a Mongo session if it ever happens in practice.
 */
const post = async ({ materialId, txn, qty = 0, reservedDelta = 0, refType = '', refId, refNo = '', orderId, orderNo = '', godown = '', note = '', by = '' }) => {
  const m = await Material.findOneAndUpdate(
    { _id: materialId }, { $inc: { physicalQty: qty, reservedQty: reservedDelta } }, { new: true });
  if (!m) throw ApiError.notFound('Material not found');
  try {
    return await Ledger.create({
      materialId: m._id, materialCode: m.code, materialName: m.name, uom: m.uom, txn, qty, reservedDelta,
      balanceAfter: { physical: m.physicalQty, reserved: m.reservedQty },
      refType, refId, refNo, orderId, orderNo, godown: godown || m.godown, note, by,
    });
  } catch (e) {
    log.error(`LEDGER WRITE FAILED after balance update · ${m.code} ${txn} ${qty}/${reservedDelta}: ${e.message}`);
    throw e;
  }
};

/** Σ PO remaining per material (on order = ordered − received, open POs only). */
const onOrderMap = async (filter = {}) => {
  const Po = mongoose.model('PurchaseOrder');
  const rows = await Po.aggregate([
    { $match: { status: { $in: ['Ordered', 'In Transit', 'Partially Received'] }, ...filter } },
    { $group: { _id: '$materialId', qty: { $sum: { $subtract: ['$orderedQty', '$receivedQty'] } }, count: { $sum: 1 }, nos: { $push: '$poNo' }, eta: { $min: '$eta' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), { qty: r.qty, count: r.count, nos: r.nos, eta: r.eta }]));
};

/** Reserved-for-this-order per material (Σ reserve − release rows). */
const reservedForOrderMap = async (orderId) => {
  const rows = await Ledger.aggregate([
    { $match: { orderId: new mongoose.Types.ObjectId(orderId), txn: { $in: ['reserve', 'release'] } } },
    { $group: { _id: '$materialId', qty: { $sum: '$reservedDelta' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.qty]));
};

const ledgerFor = async ({ materialId, orderId, limit = 200 }) => {
  const f = {};
  if (materialId) f.materialId = materialId;
  if (orderId) f.orderId = orderId;
  return Ledger.find(f).sort('-createdAt').limit(Math.min(+limit || 200, 1000));
};

/** Manual adjustment (FR-5.1) — reason is mandatory; the row is the approval trail. */
const adjust = async (req, { materialId, qty, reason, godown }) => {
  const q = +qty;
  if (!q) throw ApiError.badRequest('Quantity must be a positive or negative number');
  if (!reason || String(reason).trim().length < 4) throw ApiError.badRequest('A reason is required for a stock adjustment');
  const m = await Material.findById(materialId);
  if (!m) throw ApiError.notFound('Material not found');
  if (m.physicalQty + q < 0) throw ApiError.badRequest(`Cannot adjust by ${q} — only ${m.physicalQty} ${m.uom} in stock`);
  const row = await post({ materialId, txn: 'adjust', qty: q, refType: 'adjust', godown, note: reason, by: req.user.name });
  audit.record(req, 'stock.adjust', `Material:${m.code}`, { physicalQty: m.physicalQty }, { physicalQty: m.physicalQty + q, reason });
  log.info(`adjust · ${m.code} ${q > 0 ? '+' : ''}${q} ${m.uom} · ${reason} · ${req.user.uid}`);
  return row;
};

/**
 * Order position per BOM line (SRS Part 9, order-aware):
 *   required   = ceil(perPc × qty × (1 + waste%))
 *   available  = reservedForOrder + free          (free = physical − reserved, all orders)
 *   shortage   = max(required − available, 0)
 *   toOrder    = max(shortage − onOrder, 0)
 */
const orderPosition = async (order, user) => {
  const Bom = mongoose.model('Bom');
  const bom = order.styleId ? await Bom.findOne({ styleId: order.styleId }) : null;
  if (!bom || !bom.lines.length) return { hasBom: false, rows: [] };
  const mats = await Material.find({ _id: { $in: bom.lines.map((l) => l.materialId) } });
  const byId = Object.fromEntries(mats.map((m) => [String(m._id), m]));
  /* open POs for this order plus stock POs (not tied to any order) — both cover the shortage and both stop a duplicate PO */
  const [onOrder, reserved] = await Promise.all([onOrderMap({ $or: [{ orderId: order._id }, { orderId: null }, { orderId: { $exists: false } }] }), reservedForOrderMap(order._id)]);
  const showRate = hasFlag(user, 'rates.view');
  const rows = bom.lines.map((l) => {
    const id = String(l.materialId);
    const m = byId[id] || { physicalQty: 0, reservedQty: 0, rate: 0, category: '' };
    const required = Bom.lineRequired(l, order);   // colour / size-wise on the cutting qty (client BOM rule)
    const free = m.physicalQty - m.reservedQty;
    const reservedForOrder = reserved[id] || 0;
    const available = reservedForOrder + Math.max(free, 0);
    const shortage = Math.max(required - available, 0);
    const oo = onOrder[id] || { qty: 0, count: 0, nos: [] };
    const moq = l.moq || m.moq || 0;
    const toOrder = Math.max(shortage - oo.qty, 0) > 0 ? Math.max(Math.max(shortage - oo.qty, 0), moq) : 0;   // final PO qty = max(shortage, MOQ)
    const status = shortage === 0 ? (reservedForOrder >= required ? 'Reserved' : 'Available')
      : toOrder === 0 ? 'On Order' : 'Purchase';
    return {
      materialId: l.materialId, code: l.materialCode, name: l.materialName, uom: l.uom, category: m.category, itemType: m.itemType || '', part: l.part || '', colour: l.colour || '', moq, requiredDate: l.requiredDate, supplierId: m.supplierId, supplierName: m.supplierName || '',
      perPc: l.perPc, wastePct: l.wastePct || 0, required, physical: m.physicalQty, reserved: m.reservedQty, free,
      reservedForOrder, available, shortage, onOrder: oo.qty, openPos: oo.count, poNos: oo.nos || [], poEta: oo.eta, toOrder, status,
      buyCost: showRate ? Math.round(toOrder * (m.rate || 0)) : undefined,
    };
  });
  return { hasBom: true, version: bom.version, rows, shortages: rows.filter((r) => r.shortage > 0).length,
    toOrderLines: rows.filter((r) => r.toOrder > 0).length };
};

/** Reserve whatever free stock exists against the order's BOM, up to requirement. */
const reserveForOrder = async (req, order) => {
  const pos = await orderPosition(order, req.user);
  if (!pos.hasBom) throw ApiError.badRequest('Define the BOM for this style before reserving material');
  const done = [];
  for (const r of pos.rows) {
    const want = Math.min(Math.max(r.required - r.reservedForOrder, 0), Math.max(r.free, 0));
    if (want <= 0) continue;
    await post({ materialId: r.materialId, txn: 'reserve', reservedDelta: want, refType: 'order', refId: order._id,
      refNo: order.orderNo, orderId: order._id, orderNo: order.orderNo, note: `Reserved for ${order.orderNo}`, by: req.user.name });
    done.push(`${r.code} ${want} ${r.uom}`);
  }
  audit.record(req, 'stock.reserve', `Order:${order.orderNo}`, null, { lines: done });
  return { reserved: done };
};

const releaseForOrder = async (req, order) => {
  const reserved = await reservedForOrderMap(order._id);
  const done = [];
  for (const [materialId, q] of Object.entries(reserved)) {
    if (q <= 0) continue;
    await post({ materialId, txn: 'release', reservedDelta: -q, refType: 'order', refId: order._id,
      refNo: order.orderNo, orderId: order._id, orderNo: order.orderNo, note: `Released from ${order.orderNo}`, by: req.user.name });
    done.push(materialId);
  }
  audit.record(req, 'stock.release', `Order:${order.orderNo}`, null, { lines: done.length });
  return { released: done.length };
};

module.exports = { post, onOrderMap, reservedForOrderMap, ledgerFor, adjust, orderPosition, reserveForOrder, releaseForOrder };
