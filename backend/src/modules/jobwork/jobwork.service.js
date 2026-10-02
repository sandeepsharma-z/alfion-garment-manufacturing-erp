const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const crud = require('../../common/utils/crud');
const { plain, vendorLabel } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const JobWork = require('./jobwork.model');
const Vendor = require('../vendors/vendor.model');
const Order = require('../orders/order.model');
const Material = require('../materials/material.model');
const stock = require('../stock/stock.service');
const log = logger.child({ context: 'JobWorkService' });

const fmt = (n) => Number(n).toLocaleString('en-IN');
const OP_OF = { Cutting: 'Cutting', Stitching: 'Stitching', Finishing: 'Finishing' };

/** Location engine (FR-10.1 / SRS Part 9) — derived every time, never stored. */
const location = (sent, returned, vendorText) => {
  const pending = Math.max(sent - returned, 0);
  if (returned <= 0) return { label: 'OUTSOURCED', detail: vendorText, pending };
  if (pending > 0) return { label: 'PARTIALLY IN-HOUSE', detail: `${fmt(returned)} in-house / ${fmt(pending)} at ${vendorText}`, pending };
  return { label: 'IN-HOUSE', detail: 'Factory', pending: 0 };
};

const present = (doc, user) => {
  const j = plain(doc);
  j.vendorLabel = vendorLabel(user, j.vendorName, j.vendorAlias, j.process);
  if (!hasFlag(user, 'vendor.confidential')) { delete j.vendorName; delete j.rate; }
  j.pendingQty = Math.max(j.sentQty - j.returnedQty, 0);
  j.completionPct = j.sentQty ? Math.round(j.returnedQty * 100 / j.sentQty) : 0;
  j.location = location(j.sentQty, j.returnedQty, j.vendorLabel);
  j.overdue = JobWork.OPEN.includes(j.status) && !!j.dueDate && new Date(j.dueDate).getTime() < Date.now();
  j.displayStatus = j.overdue ? 'Overdue' : j.status;
  j.processLabel = j.process === 'Other' && j.processDesc ? j.processDesc : j.process;
  return j;
};

/** Every challan row also says what it is worth and what is still to pay (vendor rates are masked without the flag). */
const withMoney = async (user, items) => {
  const bal = await require('../payables/payables.service').jobWorkBalances(user, items.map((i) => ({ _id: i.id, sentQty: i.sentQty, returnedQty: i.returnedQty, rate: i.rate })));
  return items.map((i) => ({ ...i, ...(bal[String(i.id)] || {}) }));
};

const base = crud(JobWork, {
  label: 'jobwork',
  search: ['challanNo', 'orderNo', 'vendorName', 'vendorAlias', 'process', 'itemDesc', 'materialCode'],
  filters: ['status', 'orderId', 'vendorId', 'process', 'op'],
  present,
  beforeCreate: async () => { throw ApiError.badRequest('Use POST /jobwork/issue'); },
  beforeUpdate: async (body, req, doc) => {
    const out = {};
    /* the rate is a commercial fact — it can be agreed or corrected even after the goods are back, so the bill can be raised */
    if (body.rate !== undefined && hasFlag(req.user, 'vendor.confidential')) out.rate = Math.max(+body.rate || 0, 0);
    if (!JobWork.OPEN.includes(doc.status)) {
      if (!Object.keys(out).length) throw ApiError.badRequest(`${doc.challanNo} is ${doc.status.toLowerCase()} — only the rate can still be corrected`);
      return out;
    }
    ['dueDate', 'instructions', 'priority'].forEach((k) => { if (body[k] !== undefined) out[k] = body[k]; });
    return out;
  },
});

/** Issue a challan: material (if any) leaves physical stock and this order's reservation in the same ledger row. */
const issue = async (req, body) => {
  const order = await Order.findById(body.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  if (order.status !== 'Open') throw ApiError.badRequest(`${order.orderNo} is closed`);
  const vendor = await Vendor.findById(body.vendorId);
  if (!vendor || vendor.status !== 'Active') throw ApiError.badRequest('An active vendor is required');
  const qty = Math.round((+body.sentQty || 0) * 100) / 100;
  if (qty <= 0) throw ApiError.badRequest('Issue quantity must be greater than zero');
  const process = body.process || vendor.category;
  if (!Vendor.PROCESSES.includes(process)) throw ApiError.badRequest('Unknown process');
  if (process === 'Other' && !body.processDesc) throw ApiError.badRequest('Describe the process for "Other"');
  const material = body.materialId ? await Material.findById(body.materialId) : null;
  if (body.materialId && !material) throw ApiError.badRequest('Material not found');
  if (material && material.physicalQty < qty) throw ApiError.badRequest(`Only ${fmt(material.physicalQty)} ${material.uom} of ${material.code} is in stock — cannot issue ${fmt(qty)}`);

  const jw = await JobWork.create({
    custom: await cleanCustom('jobwork', body.custom),
    challanNo: `JW-${pad(await nextSeq('jw', 774), 4)}`,
    orderId: order._id, orderNo: order.orderNo, styleNo: order.styleNo,
    vendorId: vendor._id, vendorAlias: vendor.alias, vendorName: vendor.name,
    process, processDesc: body.processDesc || '', op: body.op || OP_OF[process] || '',
    itemDesc: body.itemDesc || (material ? material.name : process),
    materialId: material ? material._id : undefined, materialCode: material ? material.code : '',
    uom: body.uom || (material ? material.uom : 'pcs'), sentQty: qty,
    rate: hasFlag(req.user, 'vendor.confidential') ? +body.rate || 0 : 0,
    outDate: body.outDate ? new Date(body.outDate) : new Date(),
    dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 10 * 864e5),
    instructions: body.instructions || '', priority: body.priority || order.priority, createdBy: req.user.uid,
  });

  if (material) {
    const reserved = (await stock.reservedForOrderMap(order._id))[String(material._id)] || 0;
    await stock.post({ materialId: material._id, txn: 'issue_jw', qty: -qty, reservedDelta: -Math.min(reserved, qty), refType: 'jobwork',
      refId: jw._id, refNo: jw.challanNo, orderId: order._id, orderNo: order.orderNo, note: `Issued to ${vendor.name} · ${process}`, by: req.user.name });
  }
  if (jw.op) {
    const production = require('../production/production.service');
    await production.linkOutsourced(order, jw, vendor);
  }
  order.activity.push({ by: req.user.name, text: `${jw.challanNo}: ${fmt(qty)} ${jw.uom} ${jw.itemDesc} sent to ${vendor.alias} for ${process} · due ${jw.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` });
  await order.save();
  audit.record(req, 'jobwork.issue', `JobWork:${jw.challanNo}`, null, { order: order.orderNo, vendor: vendor.alias, process, qty });
  log.info(`${jw.challanNo} · ${order.orderNo} · ${vendor.alias} ${process} · ${qty} ${jw.uom}`);
  return present(jw, req.user);
};

/** Cancel before anything came back: the issue ledger row is reversed, never edited. */
const cancel = async (req, id) => {
  const jw = await JobWork.findById(id);
  if (!jw) throw ApiError.notFound('Challan not found');
  if (jw.returnedQty > 0) throw ApiError.badRequest(`${jw.challanNo} already has returns — it cannot be cancelled`);
  if (jw.status === 'Cancelled') throw ApiError.badRequest('Already cancelled');
  jw.status = 'Cancelled';
  await jw.save();
  if (jw.materialId) {
    await stock.post({ materialId: jw.materialId, txn: 'reversal', qty: jw.sentQty, refType: 'jobwork', refId: jw._id, refNo: jw.challanNo,
      orderId: jw.orderId, orderNo: jw.orderNo, note: `Challan ${jw.challanNo} cancelled — material back in stock`, by: req.user.name });
  }
  audit.record(req, 'jobwork.cancel', `JobWork:${jw.challanNo}`);
  return present(jw, req.user);
};

/**
 * Return via gate (FR-10.2): current return ≤ vendor pending, atomic; called by gate.service with the GRN it issued.
 * ponytail: processed goods come back on the same material code (the demo's rule); a separate output SKU is a later refinement.
 */
const returnViaGate = async (req, jw, { qty, rejected, grnNo, vendorChallanNo, now }) => {
  const pending = Math.max(jw.sentQty - jw.returnedQty, 0);
  if (qty > pending) {
    throw ApiError.badRequest(`Cannot return ${fmt(qty)} ${jw.uom}. Only ${fmt(pending)} ${jw.uom} are pending with this vendor against ${jw.challanNo}.`, 'OVER_RETURN');
  }
  const updated = await JobWork.findOneAndUpdate(
    { _id: jw._id, returnedQty: { $lte: jw.sentQty - qty }, status: { $in: JobWork.OPEN } },
    { $inc: { returnedQty: qty, rejectedQty: rejected }, $push: { returns: { grnNo, qty, rejectedQty: rejected, vendorChallanNo, date: now, by: req.user.name } } },
    { new: true });
  if (!updated) throw ApiError.conflict(`${jw.challanNo} was updated by another gate entry — reload and try again`);
  updated.status = updated.returnedQty >= updated.sentQty ? 'Received' : 'Partially Received';
  await updated.save();
  if (updated.status === 'Received') await refreshVendorPerformance(updated.vendorId);
  return updated;
};

/** FR-9.3 — on-time % from closed challans (last return on/before due date). */
const refreshVendorPerformance = async (vendorId) => {
  const done = await JobWork.find({ vendorId, status: 'Received' });
  if (!done.length) return;
  const onTime = done.filter((j) => j.dueDate && j.returns.length && j.returns[j.returns.length - 1].date <= j.dueDate).length;
  await Vendor.updateOne({ _id: vendorId }, { $set: { onTimePct: Math.round(onTime * 100 / done.length) } });
};

const summary = async (req) => {
  const open = await JobWork.find({ status: { $in: JobWork.OPEN } });
  const all = await JobWork.find({ status: { $ne: 'Cancelled' } });
  const sent = all.reduce((a, j) => a + j.sentQty, 0), back = all.reduce((a, j) => a + j.returnedQty, 0);
  const closed = all.filter((j) => j.status === 'Received' && j.returns.length);
  const turn = closed.length ? Math.round(closed.reduce((a, j) => a + (j.returns[j.returns.length - 1].date - j.outDate) / 864e5, 0) / closed.length) : null;
  return {
    outside: open.reduce((a, j) => a + Math.max(j.sentQty - j.returnedQty, 0), 0),
    vendorsOut: new Set(open.map((j) => String(j.vendorId))).size,
    receivedBackPct: sent ? Math.round(back * 100 / sent) : 0,
    overdue: open.filter((j) => j.dueDate && j.dueDate.getTime() < Date.now()).map((j) => j.challanNo),
    fullyReturned: all.filter((j) => j.status === 'Received').length,
    avgTurnaroundDays: turn,
    payable: (await require('../payables/payables.service').summary(req)).vendors,   // billed / paid / outstanding across every vendor
  };
};

/** Everything the printable GST job-work challan needs (frontend renders + prints, like the spec sheet). */
const challanData = async (req, id) => {
  const jw = await JobWork.findById(id);
  if (!jw) throw ApiError.notFound('Challan not found');
  const vendor = await Vendor.findById(jw.vendorId);
  const order = await Order.findById(jw.orderId);
  const { getCompany } = require('../settings/settings.routes');
  const full = hasFlag(req.user, 'vendor.confidential');
  return {
    jobwork: present(jw, req.user),
    vendor: vendor ? (full ? { name: vendor.name, alias: vendor.alias, gstin: vendor.gstin, location: vendor.location, contact: (vendor.contacts || [])[0] } : { name: `${vendor.alias} · ${vendor.category}`, alias: vendor.alias, location: (vendor.location || '').split(',')[0] }) : null,
    order: order ? { orderNo: order.orderNo, styleNo: order.styleNo, description: order.description, qty: order.qty } : null,
    company: (await getCompany()).toObject(),
  };
};

/** Σ pending-at-vendor per material (only challans that carry a material code). */
const atVendorMap = async () => {
  const rows = await JobWork.aggregate([
    { $match: { status: { $in: JobWork.OPEN }, materialId: { $ne: null } } },
    { $group: { _id: '$materialId', qty: { $sum: { $subtract: ['$sentQty', '$returnedQty'] } }, count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), { qty: r.qty, count: r.count }]));
};

const list = async (req) => { const r = await base.list(req); return { ...r, items: await withMoney(req.user, r.items) }; };
const get = async (req, id) => (await withMoney(req.user, [await base.get(req, id)]))[0];

module.exports = { ...base, list, get, present, issue, cancel, returnViaGate, summary, challanData, atVendorMap, location, refreshVendorPerformance, withMoney };
