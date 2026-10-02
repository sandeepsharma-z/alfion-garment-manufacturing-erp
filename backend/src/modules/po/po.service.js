const ApiError = require('../../common/utils/api-error');
const crud = require('../../common/utils/crud');
const { plain } = require('../../common/utils/mask');
const { nextSeq } = require('../../common/utils/counters');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Po = require('./po.model');
const Material = require('../materials/material.model');
const Supplier = require('../suppliers/supplier.model');
const Order = require('../orders/order.model');
const Bom = require('../bom/bom.model');
const { getCompany } = require('../settings/settings.routes');
const log = logger.child({ context: 'PoService' });

const present = (doc, user) => {
  const p = plain(doc);
  p.remainingQty = Math.max(p.orderedQty - p.receivedQty, 0);
  p.receivedPct = p.orderedQty ? Math.round(p.receivedQty * 100 / p.orderedQty) : 0;
  if (!hasFlag(user, 'rates.view')) { delete p.rate; delete p.value; }
  return p;
};

/** FR-7.1 — above the configurable limit a PO waits for someone with po.approve. */
const initialStatus = async (value, user) => {
  const limit = (await getCompany()).poApprovalLimit || 0;
  return limit > 0 && value > limit && !hasFlag(user, 'po.approve') ? 'Pending Approval' : 'Ordered';
};

const build = async (body, req) => {
  const m = await Material.findById(body.materialId);
  if (!m) throw ApiError.badRequest('Material is required');
  const s = await Supplier.findById(body.supplierId || m.supplierId);
  if (!s) throw ApiError.badRequest('Supplier is required');
  const qty = +body.orderedQty;
  if (!qty || qty <= 0) throw ApiError.badRequest('Ordered quantity must be greater than zero');
  const order = body.orderId ? await Order.findById(body.orderId) : null;
  const rate = hasFlag(req.user, 'rates.view') && body.rate !== undefined ? +body.rate || 0 : (m.rate || 0);
  const value = Math.round(qty * rate);
  return {
    poNo: `PO-${await nextSeq('po', 2295)}`,
    supplierId: s._id, supplierName: s.name,
    materialId: m._id, materialCode: m.code, materialName: m.name, category: m.category, uom: m.uom,
    orderId: order ? order._id : undefined, orderNo: order ? order.orderNo : '',
    orderedQty: qty, rate, value,
    poDate: body.poDate ? new Date(body.poDate) : new Date(),
    eta: body.eta ? new Date(body.eta) : new Date(Date.now() + (s.leadTimeDays || 14) * 864e5),
    paymentTerms: body.paymentTerms || s.paymentTerms || '30 days credit',
    deliveryAt: body.deliveryAt || 'Unit 1 — Noida',
    notes: body.notes || '', priority: body.priority || (order ? order.priority : 'Normal'),
    status: await initialStatus(value, req.user),
    createdBy: req.user.uid,
  };
};

const base = crud(Po, {
  label: 'po',
  form: 'po',
  search: ['poNo', 'materialCode', 'materialName', 'supplierName', 'orderNo'],
  filters: ['status', 'supplierId', 'materialId', 'orderId', 'category', 'priority'],
  present,
  beforeCreate: async (body, req) => {
    const data = await build(body, req);
    log.info(`${data.poNo} · ${data.materialCode} × ${data.orderedQty} ${data.uom} · ${data.supplierName} · ${data.status}`);
    return data;
  },
  /* only the commercial envelope can change after issue — quantities move via gate, not here */
  beforeUpdate: async (body, req, doc) => {
    if (['Fully Received', 'Cancelled'].includes(doc.status)) throw ApiError.badRequest(`${doc.poNo} is ${doc.status.toLowerCase()} and can no longer be edited`);
    const allowed = ['eta', 'notes', 'priority', 'paymentTerms', 'deliveryAt'];
    const out = {};
    allowed.forEach((k) => { if (body[k] !== undefined) out[k] = body[k]; });
    if (body.status === 'In Transit' && doc.status === 'Ordered') out.status = 'In Transit';
    if (body.status === 'Ordered' && doc.status === 'In Transit') out.status = 'Ordered';
    return out;
  },
});

const approve = async (req, id) => {
  const po = await Po.findById(id);
  if (!po) throw ApiError.notFound('PO not found');
  if (po.status !== 'Pending Approval') throw ApiError.badRequest(`${po.poNo} is not awaiting approval`);
  po.status = 'Ordered'; po.approvedBy = req.user.name; po.approvedAt = new Date();
  await po.save();
  audit.record(req, 'po.approve', `PO:${po.poNo}`, null, { value: po.value });
  return present(po, req.user);
};

const cancel = async (req, id) => {
  const po = await Po.findById(id);
  if (!po) throw ApiError.notFound('PO not found');
  if (po.receivedQty > 0) throw ApiError.badRequest(`${po.poNo} already has receipts — it cannot be cancelled`);
  if (po.status === 'Cancelled') throw ApiError.badRequest(`${po.poNo} is already cancelled`);
  po.status = 'Cancelled';
  await po.save();
  audit.record(req, 'po.cancel', `PO:${po.poNo}`);
  return present(po, req.user);
};

/** FR-6.2 — one click from the plan: a PO per shortage line, supplier from the material master. */
const fromPlan = async (req, { styleId, qty, orderId, lines }) => {
  const order = orderId ? await Order.findById(orderId) : null;
  const sid = styleId || (order && order.styleId);
  const q = +qty || (order && order.qty);
  const bom = await Bom.findOne({ styleId: sid });
  if (!bom) throw ApiError.badRequest('No BOM for this style');
  const stock = require('../stock/stock.service');
  /* need = MOQ-aware order qty (toOrder / orderQty); `lines` = [{ materialId, qty?, supplierId? }] raises only those lines, with typed quantities */
  const rows = order
    ? (await stock.orderPosition(order, req.user)).rows.map((r) => ({ ...r, need: r.toOrder }))
    : (await require('../bom/bom.routes').planRows(bom, q, req.user)).map((r) => ({ ...r, need: r.orderQty }));
  const picked = Array.isArray(lines) && lines.length ? new Map(lines.filter((l) => l && l.materialId).map((l) => [String(l.materialId), l])) : null;
  const created = [], skipped = [];
  for (const r of rows) {
    const pick = picked ? picked.get(String(r.materialId)) : null;
    if (picked && !pick) continue;
    if (!(r.need > 0) && !(pick && pick.force)) { if (r.onOrder > 0) skipped.push(`${r.code} — already on order (${(r.poNos || []).join(', ')} · ${r.onOrder} ${r.uom} pending)`); continue; }   // no duplicate POs
    const need = pick && +pick.qty > 0 ? Math.round(+pick.qty * 100) / 100 : r.need;
    if (!(need > 0)) continue;
    const m = await Material.findById(r.materialId);
    const supplierId = (pick && pick.supplierId) || (m && m.supplierId);
    if (!m || !supplierId) { skipped.push(`${r.code} — no supplier on material master`); continue; }
    const doc = await Po.create(await build({ materialId: m._id, supplierId, orderedQty: need, orderId: order ? order._id : undefined, rate: pick && pick.rate !== undefined && pick.rate !== '' ? +pick.rate : undefined,
      notes: `Auto-raised from material plan${order ? ` for ${order.orderNo}` : ''}` }, req));
    audit.record(req, 'po.create', `PO:${doc.poNo}`, null, { from: 'plan', qty: r.need });
    if (order && doc.category === 'Fabric') await require('../tna/tna.service').markEvent(order._id, 'fabric_po', new Date(), doc.poNo);
    created.push(doc.poNo);
  }
  if (order && created.length) {
    order.activity.push({ by: req.user.name, text: `${created.length} PO raised from plan: ${created.join(', ')}` });
    await order.save();
  }
  log.info(`from-plan · created ${created.length} · skipped ${skipped.length}`);
  return { created, skipped };
};

/**
 * Supplier options for one material — the master supplier, the alternates on the material, every supplier who ever got a PO for it
 * (last rate / date / on-time record) and the rest of the same-category suppliers (no rate yet). Sorted cheapest first.
 */
const supplierOptions = async (req, materialId) => {
  const m = await Material.findById(materialId);
  if (!m) throw ApiError.notFound('Material not found');
  const canRate = hasFlag(req.user, 'rates.view');
  const all = await Supplier.find({ status: { $ne: 'Inactive' } });
  const pos = await Po.find({ materialId: m._id, status: { $ne: 'Cancelled' } }).sort('-poDate');
  const opts = new Map();
  const put = (sup, patch) => { if (!sup) return; const k = String(sup._id); const cur = opts.get(k) || { supplierId: sup._id, name: sup.name, location: sup.location, paymentTerms: sup.paymentTerms, leadDays: sup.leadTimeDays || 0, rate: 0, moq: m.moq || 0, source: 'category', pos: 0, onTimePct: null }; opts.set(k, { ...cur, ...patch }); };
  all.forEach((s) => { if (s.category === m.category || s.category === 'Mixed') put(s, {}); });
  pos.forEach((p) => { const sup = all.find((s) => String(s._id) === String(p.supplierId)); if (!sup) return; const cur = opts.get(String(sup._id)); put(sup, { pos: (cur ? cur.pos : 0) + 1, ...(cur && cur.lastRate ? {} : { lastRate: p.rate, lastPoDate: p.poDate, lastPoNo: p.poNo }) }); });
  opts.forEach((o, k) => { const done = pos.filter((p) => String(p.supplierId) === k && p.status === 'Fully Received'); if (done.length) o.onTimePct = Math.round(done.filter((p) => p.receipts.length && p.eta && p.receipts[p.receipts.length - 1].date <= p.eta).length * 100 / done.length); if (o.lastRate && !o.rate) { o.rate = o.lastRate; o.source = 'last PO'; } });
  (m.suppliers || []).forEach((x) => put(all.find((s) => String(s._id) === String(x.supplierId)), { rate: x.rate || 0, moq: x.moq || m.moq || 0, leadDays: x.leadDays || undefined, source: 'alternate', note: x.note }));
  if (m.supplierId) put(all.find((s) => String(s._id) === String(m.supplierId)), { rate: m.rate || 0, moq: m.moq || 0, leadDays: m.leadDays || undefined, source: 'master', primary: true });
  const rows = [...opts.values()].map((o) => ({ ...o, leadDays: o.leadDays || 0 }));
  rows.sort((a, b) => (a.rate && b.rate ? a.rate - b.rate : a.rate ? -1 : b.rate ? 1 : 0) || (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  if (!canRate) rows.forEach((o) => { delete o.rate; delete o.lastRate; });
  return { materialId: m._id, code: m.code, uom: m.uom, primarySupplierId: m.supplierId, options: rows };
};

/** FR-7.3 — supplier rate history per material (from issued POs). */
const rateHistory = async (req, materialId) => {
  if (!hasFlag(req.user, 'rates.view')) throw ApiError.forbidden('Rates are restricted');
  const rows = await Po.find({ materialId, status: { $ne: 'Cancelled' } }).sort('-poDate').limit(50);
  return rows.map((p) => ({ poNo: p.poNo, supplierName: p.supplierName, rate: p.rate, orderedQty: p.orderedQty, uom: p.uom, poDate: p.poDate, status: p.status }));
};

const summary = async (req) => {
  const open = await Po.find({ status: { $in: Po.OPEN } });
  const soon = open.filter((p) => p.eta && (p.eta.getTime() - Date.now()) / 864e5 <= 7);
  const pending = await Po.countDocuments({ status: 'Pending Approval' });
  const closed = await Po.find({ status: 'Fully Received' });
  const onTime = closed.length ? Math.round(closed.filter((p) => p.receipts.length && p.eta && p.receipts[p.receipts.length - 1].date <= p.eta).length * 100 / closed.length) : null;
  return {
    open: open.length, pendingApproval: pending, arriving7: soon.length, arrivingNos: soon.map((p) => p.poNo),
    openValue: hasFlag(req.user, 'rates.view') ? open.reduce((a, p) => a + Math.round((p.orderedQty - p.receivedQty) * (p.rate || 0)), 0) : undefined,
    onTimePct: onTime,
  };
};

/** POST /po — crud create + TNA 'fabric booking' event for order-linked fabric POs */
const create = async (req, body) => {
  const p = await base.create(req, body);
  if (p.orderId && p.category === 'Fabric') await require('../tna/tna.service').markEvent(p.orderId, 'fabric_po', new Date(), p.poNo);
  return p;
};

/** A PO is billed on what the gate received — same rule as the supplier ledger. */
const withMoney = async (user, items) => {
  const bal = await require('../payables/payables.service').poBalances(user, items.map((i) => ({ _id: i.id, orderedQty: i.orderedQty, receivedQty: i.receivedQty, rate: i.rate })));
  return items.map((i) => ({ ...i, ...(bal[String(i.id)] || {}) }));
};
const list = async (req) => { const r = await base.list(req); return { ...r, items: await withMoney(req.user, r.items) }; };
const get = async (req, id) => (await withMoney(req.user, [await base.get(req, id)]))[0];

module.exports = { ...base, list, get, create, present, approve, cancel, fromPlan, rateHistory, summary, build, supplierOptions, withMoney };
