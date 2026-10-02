const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const { plain } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Gate = require('./gate.model');
const Po = require('../po/po.model');
const Order = require('../orders/order.model');
const stock = require('../stock/stock.service');
const JobWork = require('../jobwork/jobwork.model');
const log = logger.child({ context: 'GateService' });

const fmt = (n) => Number(n).toLocaleString('en-IN');

/** Documents waiting at the gate — open POs and open job-work challans, one shape (FR-12.1). */
const pending = async (user) => {
  const { vendorLabel } = require('../../common/utils/mask');
  const pos = await Po.find({ status: { $in: Po.OPEN } }).sort('eta');
  const jws = await JobWork.find({ status: { $in: JobWork.OPEN } }).sort('dueDate');
  return [
    ...pos.map((p) => ({
      kind: 'po', id: p._id, no: p.poNo, party: p.supplierName, materialId: p.materialId, materialCode: p.materialCode,
      material: p.materialName, uom: p.uom, orderNo: p.orderNo, orderedQty: p.orderedQty, receivedQty: p.receivedQty,
      pendingQty: Math.max(p.orderedQty - p.receivedQty, 0), status: p.status, eta: p.eta, priority: p.priority,
    })),
    ...jws.map((j) => ({
      kind: 'jw', id: j._id, no: j.challanNo, party: vendorLabel(user, j.vendorName, j.vendorAlias, j.process), materialId: j.materialId, materialCode: j.materialCode,
      material: `${j.itemDesc} · ${j.process === 'Other' && j.processDesc ? j.processDesc : j.process}`, uom: j.uom, orderNo: j.orderNo, orderedQty: j.sentQty, receivedQty: j.returnedQty,
      pendingQty: Math.max(j.sentQty - j.returnedQty, 0), status: j.dueDate && j.dueDate.getTime() < Date.now() ? 'Overdue' : j.status, eta: j.dueDate, priority: j.priority,
    })),
  ];
};

/** Job-work return through the gate: same GRN numbering, ledger + production log (FR-11.2). */
const receiveJw = async (req, body, { qty, rejected, clientUuid }) => {
  const jwSvc = require('../jobwork/jobwork.service');
  const production = require('../production/production.service');
  const jw = await JobWork.findById(body.refId);
  if (!jw) throw ApiError.notFound('Job-work challan not found');
  if (!JobWork.OPEN.includes(jw.status)) throw ApiError.badRequest(`${jw.challanNo} is ${jw.status} — nothing can be returned against it`);
  const grnNo = `GRN-${pad(await nextSeq('grn'), 4)}`;
  const gateNo = `GE-${pad(await nextSeq('gate'), 4)}`;
  const now = new Date();
  const updated = await jwSvc.returnViaGate(req, jw, { qty, rejected, grnNo, vendorChallanNo: body.challanNo || '', now });
  const entry = await Gate.create({
    custom: await cleanCustom('gate', body.custom), gateNo, grnNo, kind: 'jw', refId: jw._id, refNo: jw.challanNo, partyName: `${jw.vendorAlias} · ${jw.process}`, materialId: jw.materialId, materialCode: jw.materialCode,
    materialName: `${jw.itemDesc} · ${jw.process}`, uom: jw.uom, orderId: jw.orderId, orderNo: jw.orderNo,
    orderedQty: jw.sentQty, previousQty: jw.returnedQty, receivedQty: qty, rejectedQty: rejected,
    totalAfter: updated.returnedQty, remainingAfter: Math.max(updated.sentQty - updated.returnedQty, 0), statusAfter: updated.status,
    vehicleNo: body.vehicleNo || '', driverName: body.driverName || '', challanNo: body.challanNo || '', invoiceNo: body.invoiceNo || '',
    date: body.date ? new Date(body.date) : now, time: now.toTimeString().slice(0, 5), receivedBy: body.receivedBy || req.user.name,
    inspection: body.inspection || 'Passed 4-point', godown: body.godown || '', remarks: body.remarks || '',
    photoFileIds: Array.isArray(body.photoFileIds) ? body.photoFileIds : [], clientUuid: clientUuid || undefined, by: req.user.name,
  });
  await JobWork.updateOne({ _id: jw._id, 'returns.grnNo': grnNo }, { $set: { 'returns.$.gateEntryId': entry._id } });
  if (jw.materialId) {
    await stock.post({ materialId: jw.materialId, txn: 'return_jw', qty, refType: 'gate', refId: entry._id, refNo: grnNo, orderId: jw.orderId, orderNo: jw.orderNo,
      godown: body.godown, note: `${jw.challanNo} · ${jw.process} return from ${jw.vendorAlias}`, by: req.user.name });
  }
  if (jw.op) {
    await production.addLog(req, { orderId: jw.orderId, op: jw.op, exec: 'Outsourced', vendorId: jw.vendorId, vendorAlias: jw.vendorAlias, vendorName: jw.vendorName,
      output: qty, rejected, supervisor: `Gate · ${grnNo}`, grnNo, date: entry.date }, 'gate');
  }
  const left = Math.max(updated.sentQty - updated.returnedQty, 0);
  await Order.updateOne({ _id: jw.orderId }, { $push: { activity: { by: req.user.name,
    text: `${grnNo}: ${fmt(qty)} ${jw.uom} ${jw.itemDesc} back from ${jw.vendorAlias} (${jw.process}) against ${jw.challanNo}${left ? ` · ${fmt(left)} still at vendor` : ' · fully returned · IN-HOUSE'}` } } });
  audit.record(req, 'gate.return', `Gate:${gateNo}`, null, { grnNo, challan: jw.challanNo, qty, rejected, statusAfter: updated.status });
  log.info(`${gateNo}/${grnNo} · ${jw.challanNo} return +${qty} ${jw.uom} · ${updated.returnedQty}/${updated.sentQty} · ${updated.status}`);
  return { entry: plain(entry), duplicate: false, message: left
    ? `${grnNo} posted · ${fmt(qty)} ${jw.uom} returned · ${fmt(left)} ${jw.uom} still with vendor · PARTIALLY IN-HOUSE`
    : `${grnNo} posted · ${jw.challanNo} fully returned · IN-HOUSE` };
};

/**
 * Confirm a receipt (FR-12.2): hard server-side rule current ≤ remaining, atomic against concurrent gate posts (NFR-2),
 * idempotent on clientUuid. On success, in one go: GRN + gate row, PO received/remaining/status, stock ledger, order activity.
 */
const receive = async (req, body) => {
  const { clientUuid, kind = 'po', refId } = body || {};
  if (clientUuid) {
    const dup = await Gate.findOne({ clientUuid });
    if (dup) return { entry: plain(dup), duplicate: true };
  }
  const lots = (Array.isArray(body.lots) ? body.lots : []).filter((l) => l && (String(l.lotNo || '').trim() || +l.actualLength)).map((l) => ({
    lotNo: String(l.lotNo || '').trim(), colour: String(l.colour || '').trim(), thans: Math.max(parseInt(l.thans, 10) || 0, 0), tagLength: +l.tagLength || 0, actualLength: +l.actualLength || 0,
    tagWidth: +l.tagWidth || 0, actualWidth: +l.actualWidth || 0, gsm: +l.gsm || 0, remarks: String(l.remarks || '') }));
  body.lots = lots;
  const qty = Math.round((+body.receivedQty || (lots.length ? lots.reduce((a, l) => a + l.actualLength, 0) : 0)) * 100) / 100;   // lots typed → received = Σ actual length
  const rejected = Math.max(Math.round((+body.rejectedQty || 0) * 100) / 100, 0);
  if (qty <= 0) throw ApiError.badRequest('Received quantity must be greater than zero');
  if (kind === 'jw') return receiveJw(req, body, { qty, rejected, clientUuid });
  if (kind !== 'po') throw ApiError.badRequest('Unknown document kind');

  // Awating the PO & validating the PO before Entry 
  const po = await Po.findById(refId);
  if (!po) throw ApiError.notFound('Purchase order not found');
  if (!Po.OPEN.includes(po.status)) throw ApiError.badRequest(`${po.poNo} is ${po.status} — nothing can be received against it`);
  const remaining = Math.max(po.orderedQty - po.receivedQty, 0);
  if (qty > remaining) {
    throw ApiError.badRequest(`Cannot receive ${fmt(qty)} ${po.uom}. Only ${fmt(remaining)} ${po.uom} are pending against this purchase order.`, 'OVER_RECEIPT');
  }

  const grnNo = `GRN-${pad(await nextSeq('grn'), 4)}`;
  const gateNo = `GE-${pad(await nextSeq('gate'), 4)}`;
  const now = new Date();

  /* atomic: only succeeds if nobody else received in between (received + qty ≤ ordered) */
  const updated = await Po.findOneAndUpdate(
    { _id: po._id, receivedQty: { $lte: po.orderedQty - qty }, status: { $in: Po.OPEN } },
    { $inc: { receivedQty: qty, rejectedQty: rejected },
      $push: { receipts: { grnNo, qty, rejectedQty: rejected, challanNo: body.challanNo || '', date: now, by: req.user.name } } },
    { new: true });
  if (!updated) throw ApiError.conflict(`${po.poNo} was updated by another gate entry — reload and try again`);
  updated.status = updated.receivedQty >= updated.orderedQty ? 'Fully Received' : 'Partially Received';
  await updated.save();

  const entry = await Gate.create({
    custom: await cleanCustom('gate', body.custom), gateNo, grnNo, kind: 'po', refId: po._id, refNo: po.poNo, partyName: po.supplierName,
    materialId: po.materialId, materialCode: po.materialCode, materialName: po.materialName, uom: po.uom,
    orderId: po.orderId, orderNo: po.orderNo,
    orderedQty: po.orderedQty, previousQty: po.receivedQty, receivedQty: qty, rejectedQty: rejected,
    totalAfter: updated.receivedQty, remainingAfter: Math.max(updated.orderedQty - updated.receivedQty, 0), statusAfter: updated.status,
    vehicleNo: body.vehicleNo || '', driverName: body.driverName || '', challanNo: body.challanNo || '', invoiceNo: body.invoiceNo || '',
    date: body.date ? new Date(body.date) : now, time: now.toTimeString().slice(0, 5), receivedBy: body.receivedBy || req.user.name,
    inspection: body.inspection || 'Passed 4-point', godown: body.godown || '', remarks: body.remarks || '',
    photoFileIds: Array.isArray(body.photoFileIds) ? body.photoFileIds : [], lots: body.lots, clientUuid: clientUuid || undefined, by: req.user.name,
  });
  await Po.updateOne({ _id: po._id, 'receipts.grnNo': grnNo }, { $set: { 'receipts.$.gateEntryId': entry._id } });

  /* stock increases only now (FR-12) */
  await stock.post({ materialId: po.materialId, txn: 'receipt', qty, refType: 'gate', refId: entry._id, refNo: grnNo,
    orderId: po.orderId, orderNo: po.orderNo, godown: body.godown, note: `${po.poNo} · ${po.supplierName} · ${entry.vehicleNo || 'no vehicle'}`, by: req.user.name });

  if (po.orderId) {
    await Order.updateOne({ _id: po.orderId }, { $push: { activity: { by: req.user.name,
      text: `${grnNo}: ${fmt(qty)} ${po.uom} ${po.materialName} received at gate against ${po.poNo}${updated.status === 'Fully Received' ? ' · PO fully received' : ` · ${fmt(updated.orderedQty - updated.receivedQty)} pending`}` } } });
  }
  if (po.orderId && updated.status === 'Fully Received') {
    const ev = po.category === 'Fabric' ? 'fabric_in' : ['Accessory', 'Packing'].includes(po.category) ? 'trims_in' : '';
    if (ev) await require('../tna/tna.service').markEvent(po.orderId, ev, entry.date, grnNo);
  }
  audit.record(req, 'gate.receive', `Gate:${gateNo}`, null, { grnNo, po: po.poNo, qty, rejected, statusAfter: updated.status });
  log.info(`${gateNo}/${grnNo} · ${po.poNo} +${qty} ${po.uom} · total ${updated.receivedQty}/${updated.orderedQty} · ${updated.status} · by ${req.user.uid}`);
  return { entry: plain(entry), duplicate: false,
    message: updated.status === 'Fully Received'
      ? `${grnNo} posted · ${po.poNo} fully received · stock updated`
      : `${grnNo} posted · ${fmt(qty)} ${po.uom} received · ${fmt(updated.orderedQty - updated.receivedQty)} ${po.uom} still pending` };
};

const register = async (query) => {
  const { q = '', kind, from, to, page = 1, size = 100 } = query;
  const f = {};
  if (kind) f.kind = kind;
  if (q) f.$or = ['gateNo', 'grnNo', 'refNo', 'partyName', 'materialName', 'materialCode', 'orderNo', 'vehicleNo', 'challanNo'].map((k) => ({ [k]: { $regex: q, $options: 'i' } }));
  if (from || to) { f.date = {}; if (from) f.date.$gte = new Date(from); if (to) f.date.$lte = new Date(`${to}T23:59:59`); }
  const items = await Gate.find(f).sort('-createdAt').skip((page - 1) * size).limit(Math.min(+size, 500));
  const total = await Gate.countDocuments(f);
  return { items: items.map(plain), total };
};

const summary = async (user) => {
  const docs = await pending(user);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = await Gate.countDocuments({ createdAt: { $gte: start } });
  return { awaiting: docs.length, pendingQty: docs.reduce((a, d) => a + d.pendingQty, 0), verifiedToday: today,
    withVendors: docs.filter((d) => d.kind === 'jw').reduce((a, d) => a + d.pendingQty, 0), jwOpen: docs.filter((d) => d.kind === 'jw').length };
};

module.exports = { pending, receive, register, summary };
