const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const { plain, vendorLabel, buyerLabel } = require('../../common/utils/mask');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const { ProductionOp, ProductionLog, CuttingReport, LoadingPlan, OPS } = require('./production.model');
const { nextSeq, pad } = require('../../common/utils/counters');
const Order = require('../orders/order.model');
const Vendor = require('../vendors/vendor.model');
const log = logger.child({ context: 'ProductionService' });

const fmt = (n) => Number(n).toLocaleString('en-IN');
const STAGE_ORDER = ['Order Confirmed', 'Material Sourcing', 'Job Work', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Dispatch', 'Payment', 'Closed'];

/* ---------- derived state (same rules as the approved demo) ---------- */
const opState = (o) => {
  if (o.blocked) return 'Blocked';
  if (o.doneQty <= 0) return 'Pending';
  if (o.doneQty >= o.plannedQty) return 'Completed';
  return o.exec === 'Outsourced' ? 'Partially Received' : 'In Process';
};
const opLocation = (o, vendorText) => {
  if (o.exec === 'In-house') return o.line ? `Factory · ${o.line}` : 'Factory';
  if (o.doneQty >= o.plannedQty) return 'Factory';
  if (o.doneQty > 0) return `${fmt(o.doneQty)} in-house / ${fmt(Math.max(o.plannedQty - o.doneQty, 0))} at ${vendorText}`;
  return vendorText;
};
const presentOp = (doc, user) => {
  const o = plain(doc);
  o.vendorLabel = o.exec === 'Outsourced' ? vendorLabel(user, o.vendorName, o.vendorAlias, o.op) : '';
  if (!hasFlag(user, 'vendor.confidential')) delete o.vendorName;
  o.whereLabel = o.exec === 'Outsourced' ? (o.vendorLabel || 'vendor not assigned') : (o.line || 'line not assigned');
  o.pendingQty = Math.max(o.plannedQty - o.doneQty, 0);
  o.pct = o.plannedQty ? Math.min(Math.round(o.doneQty * 100 / o.plannedQty), 100) : 0;
  o.state = opState(o);
  o.location = opLocation(o, o.vendorLabel || 'vendor');
  return o;
};
const presentLog = (doc, user) => {
  const l = plain(doc);
  if (l.exec === 'Outsourced') l.where = vendorLabel(user, l.vendorName, l.where, l.op);
  delete l.vendorName;
  return l;
};

/** Every open order gets its four operations (planned = order qty; cutting uses the cutting qty). */
const ensureOps = async (order) => {
  for (const op of OPS) {
    await ProductionOp.updateOne({ orderId: order._id, op },
      { $setOnInsert: { orderNo: order.orderNo, styleNo: order.styleNo, plannedQty: op === 'Cutting' ? (order.cutQty || order.qty) : order.qty } },
      { upsert: true });
  }
  return ProductionOp.find({ orderId: order._id });
};

/** A job-work challan for Cutting/Stitching/Finishing makes that operation Outsourced to the vendor. */
const linkOutsourced = async (order, jw, vendor) => {
  await ensureOps(order);
  await ProductionOp.updateOne({ orderId: order._id, op: jw.op },
    { $set: { exec: 'Outsourced', vendorId: vendor._id, vendorAlias: vendor.alias, vendorName: vendor.name }, $addToSet: { jobWorkIds: jw._id } });
};

/** Order progress = Σ done / Σ planned across the four operations; the stage only ever moves forward. */
const recomputeOrder = async (orderId) => {
  const ops = await ProductionOp.find({ orderId });
  const order = await Order.findById(orderId);
  if (!order || !ops.length) return;
  const planned = ops.reduce((a, o) => a + o.plannedQty, 0);
  const done = ops.reduce((a, o) => a + Math.min(o.doneQty, o.plannedQty), 0);
  order.progress = planned ? Math.round(done * 100 / planned) : 0;
  const started = OPS.filter((op) => ops.find((o) => o.op === op && o.doneQty > 0));
  const newest = started[started.length - 1];
  if (newest && order.status === 'Open' && STAGE_ORDER.indexOf(newest) > STAGE_ORDER.indexOf(order.stage)) order.stage = newest;
  await order.save();
};

/** FR-11.1 — a log row advances the matching operation. `source: 'gate'` rows come from job-work returns (FR-11.2). */
const addLog = async (req, body, source = 'manual') => {
  const order = await Order.findById(body.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  if (order.status !== 'Open') throw ApiError.badRequest(`${order.orderNo} is closed`);
  if (!OPS.includes(body.op)) throw ApiError.badRequest('Stage must be Cutting, Stitching, Finishing or Packing');
  const output = Math.round(+body.output || 0);
  if (output <= 0) throw ApiError.badRequest('Output quantity must be greater than zero');
  const rejected = Math.max(Math.round(+body.rejected || 0), 0);
  await ensureOps(order);
  const op = await ProductionOp.findOne({ orderId: order._id, op: body.op });
  if (op.blocked && source === 'manual') throw ApiError.badRequest(`${order.orderNo} ${body.op} is blocked — ${op.blockedReason || 'clear the block first'}`);
  const exec = body.exec || op.exec;
  const row = await ProductionLog.create({
    custom: source === 'manual' ? await cleanCustom('production', body.custom) : {},   // gate returns are not typed on the form
    date: body.date ? new Date(body.date) : new Date(), orderId: order._id, orderNo: order.orderNo, op: body.op, exec,
    where: exec === 'Outsourced' ? (body.vendorAlias || op.vendorAlias || 'vendor') : (body.where || op.line || ''),
    vendorId: exec === 'Outsourced' ? (body.vendorId || op.vendorId) : undefined, vendorName: exec === 'Outsourced' ? (body.vendorName || op.vendorName) : '',
    workers: Math.max(+body.workers || 0, 0), output, rejected, supervisor: body.supervisor || req.user.name, source, grnNo: body.grnNo || '', note: body.note || '', by: req.user.name,
    colour: String(body.colour || ''), loaded: Math.max(Math.round(+body.loaded || 0), 0), hourly: body.hourly && typeof body.hourly === 'object' ? Object.fromEntries(Object.entries(body.hourly).filter(([, v]) => +v > 0).map(([k, v]) => [String(k), Math.round(+v)])) : {},
  });
  op.doneQty = Math.min(op.doneQty + output, op.plannedQty);
  op.rejectedQty += rejected;
  if (body.where && exec === 'In-house' && !op.line) op.line = body.where;
  await op.save();
  await recomputeOrder(order._id);
  const tna = require('../tna/tna.service');
  const k = op.op.toLowerCase();
  if (op.doneQty > 0) await tna.markEvent(order._id, `${k}_start`, row.date, `${op.op} log`);
  if (op.doneQty >= op.plannedQty && op.plannedQty > 0) await tna.markEvent(order._id, `${k}_complete`, row.date, `${op.op} completed`);
  if (source === 'manual') {
    await Order.updateOne({ _id: order._id }, { $push: { activity: { by: req.user.name, text: `${body.op}: ${fmt(output)} pcs logged${row.where ? ` · ${row.where}` : ''}${rejected ? ` · ${rejected} rejected` : ''}` } } });
    audit.record(req, 'production.log', `Order:${order.orderNo}`, null, { op: body.op, output, rejected, where: row.where });
  }
  log.info(`${order.orderNo} ${body.op} +${output} (${source}) · done ${op.doneQty}/${op.plannedQty}`);
  return { log: presentLog(row, req.user), op: presentOp(op, req.user) };
};

/** Plan an operation: execution type, vendor or line, planned qty, block/unblock (with reason). */
const planOp = async (req, id, body) => {
  const op = await ProductionOp.findById(id);
  if (!op) throw ApiError.notFound('Operation not found');
  const before = op.toObject();
  if (body.exec) op.exec = body.exec;
  if (body.exec === 'Outsourced' || body.vendorId) {
    if (body.vendorId) {
      const v = await Vendor.findById(body.vendorId);
      if (!v) throw ApiError.badRequest('Vendor not found');
      op.vendorId = v._id; op.vendorAlias = v.alias; op.vendorName = v.name;
    }
  }
  if (body.exec === 'In-house') { op.vendorId = undefined; op.vendorAlias = ''; op.vendorName = ''; }
  if (body.line !== undefined) op.line = body.line;
  if (body.plannedQty !== undefined && +body.plannedQty > 0) op.plannedQty = +body.plannedQty;
  if (body.blocked !== undefined) {
    op.blocked = !!body.blocked;
    op.blockedReason = op.blocked ? (body.blockedReason || 'Blocked') : '';
    await Order.updateOne({ _id: op.orderId }, { $push: { activity: { by: req.user.name, text: op.blocked ? `${op.op} blocked — ${op.blockedReason}` : `${op.op} unblocked` } } });
  }
  await op.save();
  await recomputeOrder(op.orderId);
  audit.record(req, 'production.plan', `Order:${op.orderNo}/${op.op}`, before, op.toObject());
  return presentOp(op, req.user);
};

/* ---------- daily cutting report (AFN/11) ---------- */
const cuttingCreate = async (req, b) => {
  const order = await Order.findById(b.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  if (order.status !== 'Open') throw ApiError.badRequest(`${order.orderNo} is closed`);
  const sizes = {}; Object.entries(b.sizes && typeof b.sizes === 'object' ? b.sizes : {}).forEach(([k, v]) => { const n = Math.max(Math.round(+v || 0), 0); if (n) sizes[String(k).trim()] = n; });
  const cutPcs = Object.values(sizes).reduce((a, n) => a + n, 0) || Math.max(Math.round(+b.cutPcs || 0), 0);
  if (cutPcs <= 0) throw ApiError.badRequest('Enter the size-wise cut quantity');
  const Material = require('../materials/material.model');
  const m = b.materialId ? await Material.findById(b.materialId) : null;
  const consumed = Math.max(+b.consumedMeters || 0, 0);
  const doc = await CuttingReport.create({
    cutNo: `CUT-${pad(await nextSeq('cutting'), 4)}`, date: b.date ? new Date(b.date) : new Date(), orderId: order._id, orderNo: order.orderNo, styleNo: order.styleNo, colour: String(b.colour || ''),
    materialId: m ? m._id : undefined, materialCode: m ? m.code : '', materialName: m ? m.name : String(b.materialName || ''), lotNo: String(b.lotNo || ''), thans: Math.max(parseInt(b.thans, 10) || 0, 0),
    widthInches: +b.widthInches || 0, layers: Math.max(parseInt(b.layers, 10) || 0, 0), totalMeters: Math.max(+b.totalMeters || 0, 0), consumedMeters: consumed, endBitsMeters: Math.max(+b.endBitsMeters || 0, 0),
    sizes, cutPcs, avgPerPc: consumed ? Math.round(consumed / cutPcs * 1000) / 1000 : 0, table: String(b.table || ''), cutter: String(b.cutter || ''), remarks: String(b.remarks || ''), by: req.user.name,
  });
  await addLog(req, { orderId: order._id, op: 'Cutting', exec: 'In-house', where: doc.table, output: cutPcs, date: doc.date, colour: doc.colour, supervisor: doc.cutter || req.user.name, note: `${doc.cutNo} · lot ${doc.lotNo || '—'}` }, 'cutting');
  if (m && consumed > 0) {
    const stock = require('../stock/stock.service');
    const reserved = (await stock.reservedForOrderMap(order._id))[String(m._id)] || 0;
    await stock.post({ materialId: m._id, txn: 'issue_prod', qty: -Math.min(consumed, Math.max(m.physicalQty, 0)), reservedDelta: -Math.min(reserved, consumed), refType: 'cutting', refId: doc._id, refNo: doc.cutNo,
      orderId: order._id, orderNo: order.orderNo, note: `Cutting ${doc.cutNo} · ${cutPcs} pcs · lot ${doc.lotNo || '—'}`, by: req.user.name });
  }
  await Order.updateOne({ _id: order._id }, { $push: { activity: { by: req.user.name, text: `Cutting report ${doc.cutNo}: ${fmt(cutPcs)} pcs${doc.colour ? ` · ${doc.colour}` : ''}${consumed ? ` · ${consumed} m fabric consumed` : ''}` } } });
  audit.record(req, 'production.cutting', `Order:${order.orderNo}`, null, { cutNo: doc.cutNo, cutPcs, consumed, lot: doc.lotNo });
  return plain(doc);
};
const cuttingList = async (q = {}) => {
  const f = {};
  if (q.orderId) f.orderId = q.orderId;
  if (q.from || q.to) { f.date = {}; if (q.from) f.date.$gte = new Date(q.from); if (q.to) f.date.$lte = new Date(`${q.to}T23:59:59`); }
  const rows = await CuttingReport.find(f).sort('-date -createdAt').limit(Math.min(+q.size || 200, 1000));
  return { items: rows.map(plain), total: rows.length };
};

/* ---------- stitching WIP (AFN/14): per order × colour × line — cut received, loaded, output, WIP, cutting in stock ---------- */
const wip = async (req, q = {}) => {
  const orders = await Order.find(q.orderId ? { _id: q.orderId } : { status: 'Open' }).sort('shipDate');
  const ids = orders.map((o) => o._id);
  const logs = await ProductionLog.find({ orderId: { $in: ids }, op: { $in: ['Cutting', 'Stitching', 'Finishing'] } });
  const to = q.to ? new Date(`${q.to}T23:59:59`) : null;
  const rows = [];
  for (const o of orders) {
    const mine = logs.filter((l) => String(l.orderId) === String(o._id) && (!to || l.date <= to));
    const colours = [...new Set([...(o.colours || []).map((c) => c.name || c.code), ...mine.map((l) => l.colour)].filter(Boolean))];
    const keys = colours.length ? colours : [''];
    for (const colour of keys) {
      const of = (op) => mine.filter((l) => l.op === op && (!colour || (l.colour || '') === colour || (!l.colour && keys.length === 1)));
      const cut = of('Cutting').reduce((a, l) => a + l.output, 0);
      const st = of('Stitching');
      const loaded = st.reduce((a, l) => a + (l.loaded || 0), 0), output = st.reduce((a, l) => a + l.output, 0), rejected = st.reduce((a, l) => a + l.rejected, 0);
      const finishing = of('Finishing').reduce((a, l) => a + l.output, 0);
      const lines = [...new Set(st.map((l) => l.where).filter(Boolean))];
      const col = (o.colours || []).find((c) => (c.name || c.code) === colour);
      rows.push({ orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, buyerName: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), colour, orderQty: col ? col.qty : o.qty, cutQty: col ? col.cutQty : o.cutQty,
        cut, loaded, output, rejected, wip: Math.max(loaded - output, 0), cuttingInStock: Math.max(cut - loaded, 0), finishing, balanceToStitch: Math.max((col ? col.qty : o.qty) - output, 0), lines, shipDate: o.shipDate });
    }
  }
  return { items: rows, asOf: to || new Date() };
};

/* ---------- loading plan: date × line × process → planned order / target vs actual from logs ---------- */
const loadingPlan = async (req, q = {}) => {
  const from = q.from ? new Date(q.from) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = q.to ? new Date(`${q.to}T23:59:59`) : new Date(from.getTime() + 6 * 864e5);
  const plans = await LoadingPlan.find({ date: { $gte: from, $lte: to } }).sort('date line');
  const logs = await ProductionLog.find({ date: { $gte: from, $lte: to }, exec: 'In-house' });
  const day = (d) => new Date(d).toISOString().slice(0, 10);
  const items = plans.map((p) => {
    const actual = logs.filter((l) => day(l.date) === day(p.date) && l.where === p.line && l.op === p.process && String(l.orderId) === String(p.orderId) && (!p.colour || (l.colour || '') === p.colour)).reduce((a, l) => a + l.output, 0);
    return { ...plain(p), actual, pct: p.target ? Math.round(actual * 100 / p.target) : 0 };
  });
  const { getCompany } = require('../settings/settings.routes');
  return { items, from, to, lines: (await getCompany()).lines || [] };
};
const loadingSave = async (req, b) => {
  const order = await Order.findById(b.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  if (!b.date || !b.line) throw ApiError.badRequest('Date and line are required');
  const key = { date: new Date(b.date), line: String(b.line), process: OPS.includes(b.process) ? b.process : 'Stitching', orderId: order._id, colour: String(b.colour || '') };
  const doc = await LoadingPlan.findOneAndUpdate(key, { $set: { ...key, orderNo: order.orderNo, styleNo: order.styleNo, target: Math.max(Math.round(+b.target || 0), 0), note: String(b.note || ''), by: req.user.name } }, { new: true, upsert: true });
  audit.record(req, 'production.loading', `Order:${order.orderNo}`, null, { date: b.date, line: b.line, target: doc.target });
  return plain(doc);
};
const loadingDelete = async (req, id) => { const doc = await LoadingPlan.findByIdAndDelete(id); if (!doc) throw ApiError.notFound('Plan row not found'); audit.record(req, 'production.loading.delete', `LoadingPlan:${id}`, plain(doc), null); return { ok: true }; };

/** Order revision changed quantities → planned qty follows (done qty is never touched). */
const syncPlanned = async (order) => {
  for (const op of OPS) await ProductionOp.updateOne({ orderId: order._id, op }, { $set: { plannedQty: op === 'Cutting' ? (order.cutQty || order.qty) : order.qty } });
  await recomputeOrder(order._id);
};

const orderOps = async (order, user) => (await ensureOps(order)).map((o) => presentOp(o, user));

/** Compact numbers for the Control Tower. */
const orderSummary = async (orderId) => {
  const ops = await ProductionOp.find({ orderId });
  const planned = ops.reduce((a, o) => a + o.plannedQty, 0), done = ops.reduce((a, o) => a + Math.min(o.doneQty, o.plannedQty), 0);
  const packing = ops.find((o) => o.op === 'Packing');
  return { ops: ops.length, planned, done, pct: planned ? Math.round(done * 100 / planned) : 0,
    blocked: ops.filter((o) => o.blocked).map((o) => `${o.op}: ${o.blockedReason}`),
    packingPct: packing && packing.plannedQty ? Math.min(Math.round(packing.doneQty * 100 / packing.plannedQty), 100) : 0,
    packingDone: !!packing && packing.doneQty >= packing.plannedQty && packing.plannedQty > 0 };
};

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Kanban + register + line table + KPIs in one call (the Production Floor page). */
const board = async (req) => {
  const orders = await Order.find({ status: 'Open' }).sort('shipDate');
  for (const o of orders) await ensureOps(o);
  const ops = await ProductionOp.find({ orderId: { $in: orders.map((o) => o._id) } });
  const byOrder = Object.fromEntries(orders.map((o) => [String(o._id), o]));
  const media = await require('../orders/orders.service').photosOf(orders);
  const cards = ops.map((op) => {
    const o = byOrder[String(op.orderId)];
    const p = presentOp(op, req.user);
    return { ...p, buyerName: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), description: o.description, priority: o.priority, shipDate: o.shipDate, orderQty: o.qty, photo: (media[String(o._id)] || {}).photos?.[0] || null };
  });
  const today = await ProductionLog.find({ date: { $gte: startOfToday() } });
  /* last 7 days (incl. today) output per day + today's output per operation — for the floor pulse */
  const weekStart = new Date(new Date(new Date().toISOString().slice(0, 10)).getTime() - 6 * 864e5);   // UTC day keys — typed log dates are stored at UTC midnight
  const weekLogs = await ProductionLog.find({ date: { $gte: weekStart } }).select('date output rejected op');
  const week = Array.from({ length: 7 }, (_, i) => { const k = new Date(weekStart.getTime() + i * 864e5).toISOString().slice(0, 10); const rows = weekLogs.filter((l) => l.date.toISOString().slice(0, 10) === k); return { date: k, output: rows.reduce((a, l) => a + l.output, 0), rejected: rows.reduce((a, l) => a + l.rejected, 0) }; });
  const todayByOp = OPS.map((op) => ({ op, output: today.filter((l) => l.op === op).reduce((a, l) => a + l.output, 0) }));
  const out = today.reduce((a, l) => a + l.output, 0), rej = today.reduce((a, l) => a + l.rejected, 0);
  const { getCompany } = require('../settings/settings.routes');
  const company = await getCompany();
  const lineNames = company.lines || [];
  const target = company.lineTarget || 800;
  const inhouseToday = today.filter((l) => l.exec === 'In-house');
  const lines = lineNames.map((name) => {
    const rows = inhouseToday.filter((l) => l.where === name);
    const output = rows.reduce((a, l) => a + l.output, 0), rejected = rows.reduce((a, l) => a + l.rejected, 0);
    const last = rows[rows.length - 1];
    return { line: name, orderNo: last ? last.orderNo : '', op: last ? last.op : '', workers: rows.reduce((a, l) => a + l.workers, 0), output, rejected,
      supervisor: last ? last.supervisor : '', target, efficiency: Math.round(output * 100 / target), status: !rows.length ? 'Idle' : output >= target ? 'On Target' : 'Running' };
  });
  const outsourcedOpen = ops.filter((o) => o.exec === 'Outsourced' && o.doneQty < o.plannedQty);
  return {
    kpi: {
      todayOutput: out, todayRejected: rej, dhu: out + rej ? Math.round(rej * 1000 / (out + rej)) / 10 : 0,
      manpower: inhouseToday.reduce((a, l) => a + l.workers, 0), linesIdle: lines.filter((l) => l.status === 'Idle').map((l) => l.line),
      outsourcedOps: outsourcedOpen.length, pendingAtVendors: outsourcedOpen.reduce((a, o) => a + Math.max(o.plannedQty - o.doneQty, 0), 0),
      blocked: ops.filter((o) => o.blocked).length,
    },
    ops: OPS, cards, lines, lineTarget: target, lineNames, week, todayByOp,
  };
};

const logs = async (req, query) => {
  const f = {};
  if (query.orderId) f.orderId = query.orderId;
  if (query.op) f.op = query.op;
  if (query.from || query.to) { f.date = {}; if (query.from) f.date.$gte = new Date(query.from); if (query.to) f.date.$lte = new Date(`${query.to}T23:59:59`); }
  const rows = await ProductionLog.find(f).sort('-date -createdAt').limit(Math.min(+query.size || 200, 1000));
  return { items: rows.map((r) => presentLog(r, req.user)), total: rows.length };
};

module.exports = { ensureOps, linkOutsourced, addLog, planOp, orderOps, orderSummary, board, logs, presentOp, recomputeOrder, syncPlanned, cuttingCreate, cuttingList, wip, loadingPlan, loadingSave, loadingDelete };
