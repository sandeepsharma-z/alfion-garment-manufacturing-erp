const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const { plain } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const { FabricInspection, InlineInspection, AqlInspection, MeasurementInspection, NeedleRecord, BladeRecord, DEFAULT_DEFECTS, FABRIC_CATEGORIES } = require('./quality.model');
const Material = require('../materials/material.model');
const Order = require('../orders/order.model');
const Gate = require('../gate/gate.model');
const JobWork = require('../jobwork/jobwork.model');
const stock = require('../stock/stock.service');
const log = logger.child({ context: 'QualityService' });

const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** ANSI/ASQ Z1.4 single sampling, normal, general level II — sample size + Ac/Re for AQL 2.5 and 4.0 */
const AQL_TABLE = [
  [8, 2, { '2.5': [0, 1], '4.0': [0, 1] }], [15, 3, { '2.5': [0, 1], '4.0': [0, 1] }], [25, 5, { '2.5': [0, 1], '4.0': [0, 1] }],
  [50, 8, { '2.5': [0, 1], '4.0': [1, 2] }], [90, 13, { '2.5': [1, 2], '4.0': [1, 2] }], [150, 20, { '2.5': [1, 2], '4.0': [2, 3] }],
  [280, 32, { '2.5': [2, 3], '4.0': [3, 4] }], [500, 50, { '2.5': [3, 4], '4.0': [5, 6] }], [1200, 80, { '2.5': [5, 6], '4.0': [7, 8] }],
  [3200, 125, { '2.5': [7, 8], '4.0': [10, 11] }], [10000, 200, { '2.5': [10, 11], '4.0': [14, 15] }], [35000, 315, { '2.5': [14, 15], '4.0': [21, 22] }],
  [150000, 500, { '2.5': [21, 22], '4.0': [21, 22] }], [Infinity, 800, { '2.5': [21, 22], '4.0': [21, 22] }],
];
const aqlPlan = (lotSize, level = '2.5') => {
  const row = AQL_TABLE.find(([max]) => lotSize <= max) || AQL_TABLE[AQL_TABLE.length - 1];
  const [accept, reject] = row[2][level] || row[2]['2.5'];
  return { sampleSize: Math.min(row[1], lotSize || row[1]), acceptNo: accept, rejectNo: reject, level };
};

const defectMaster = async () => { const s = await settings(); return Array.isArray(s.defects) && s.defects.length ? s.defects : DEFAULT_DEFECTS; };

/* ---------- fabric 4-point (FR-20.1) ---------- */
const fabricCreate = async (req, b) => {
  const m = await Material.findById(b.materialId);
  if (!m) throw ApiError.badRequest('Material is required');
  const meters = +b.metersChecked, width = +b.widthInches || 58;
  if (!(meters > 0)) throw ApiError.badRequest('Metres inspected must be greater than zero');
  const defects = (Array.isArray(b.defects) ? b.defects : []).map((d) => ({ category: d.category, p1: +d.p1 || 0, p2: +d.p2 || 0, p3: +d.p3 || 0, p4: +d.p4 || 0 }));
  const totalPoints = defects.reduce((a, d) => a + d.p1 + 2 * d.p2 + 3 * d.p3 + 4 * d.p4, 0);
  const pointsPer100 = Math.round(totalPoints * 3937 / (meters * width) * 10) / 10;          // AFN 10 formula (per 100 sq m)
  const pointsPer100Yd = Math.round(totalPoints * 3600 / (meters * 1.09361 * width) * 10) / 10;   // per 100 sq yards
  const unit = b.unit === 'sqyd' ? 'sqyd' : 'sqm';
  const limit = +b.limit || (await settings()).fabricPointsLimit || 20;
  const result = (unit === 'sqyd' ? pointsPer100Yd : pointsPer100) <= limit ? 'Pass' : 'Fail';
  const gate = b.gateEntryId ? await Gate.findById(b.gateEntryId) : null;
  const doc = await FabricInspection.create({
    custom: await cleanCustom('quality_fabric', b.custom), inspNo: `FI-${pad(await nextSeq('fabricInsp'), 4)}`, gateEntryId: gate ? gate._id : undefined, grnNo: gate ? gate.grnNo : (b.grnNo || ''),
    materialId: m._id, materialCode: m.code, materialName: m.name, supplierName: gate ? gate.partyName : (m.supplierName || ''),
    lot: b.lot || '', colour: b.colour || '', metersChecked: meters, widthInches: width, defects, totalPoints, pointsPer100, pointsPer100Yd, unit, limit, result,
    tagLength: +b.tagLength || 0, tagWidth: +b.tagWidth || 0, actualWidth: +b.actualWidth || width, thans: Math.max(parseInt(b.thans, 10) || 0, 0), checkInDate: b.checkInDate ? new Date(b.checkInDate) : undefined,
    hold: result === 'Fail', holdQty: result === 'Fail' ? Math.min(meters, Math.max(m.physicalQty - m.reservedQty, 0)) : 0,
    inspector: b.inspector || req.user.name, remarks: b.remarks || '', gsm: b.gsm || '', photoFileIds: Array.isArray(b.photoFileIds) ? b.photoFileIds : [],
    date: b.date ? new Date(b.date) : new Date(), by: req.user.name,
  });
  if (doc.hold && doc.holdQty > 0) {
    await stock.post({ materialId: m._id, txn: 'reserve', reservedDelta: doc.holdQty, refType: 'quality', refId: doc._id, refNo: doc.inspNo,
      note: `Quality hold · ${doc.inspNo} · ${pointsPer100} pts/100 sq m (limit ${limit})`, by: req.user.name });
  }
  audit.record(req, 'quality.fabric', `FabricInspection:${doc.inspNo}`, null, { material: m.code, pointsPer100, result, hold: doc.holdQty });
  log.info(`${doc.inspNo} · ${m.code} · ${pointsPer100} pts/100 · ${result}${doc.hold ? ` · HOLD ${doc.holdQty}` : ''}`);
  return plain(doc);
};
/** Edit a 4-point inspection: fields + defect grid are recomputed; the quality hold follows the new result (Fail → hold free stock, Pass → release). */
const fabricUpdate = async (req, id, b) => {
  const doc = await FabricInspection.findById(id);
  if (!doc) throw ApiError.notFound('Inspection not found');
  const before = doc.toObject();
  ['grnNo', 'lot', 'colour', 'gsm', 'inspector', 'remarks'].forEach((k) => { if (b[k] !== undefined) doc.set(k, String(b[k])); });
  ['tagLength', 'tagWidth', 'actualWidth', 'thans'].forEach((k) => { if (b[k] !== undefined) doc.set(k, +b[k] || 0); });
  if (b.date !== undefined) doc.date = b.date ? new Date(b.date) : doc.date;
  if (b.checkInDate !== undefined) doc.checkInDate = b.checkInDate ? new Date(b.checkInDate) : undefined;
  if (b.unit !== undefined) doc.unit = b.unit === 'sqyd' ? 'sqyd' : 'sqm';
  if (b.metersChecked !== undefined) { if (!(+b.metersChecked > 0)) throw ApiError.badRequest('Metres inspected must be greater than zero'); doc.metersChecked = +b.metersChecked; }
  if (b.widthInches !== undefined) doc.widthInches = +b.widthInches || 58;
  if (Array.isArray(b.defects)) doc.defects = b.defects.map((d) => ({ category: d.category, p1: +d.p1 || 0, p2: +d.p2 || 0, p3: +d.p3 || 0, p4: +d.p4 || 0 }));
  if (Array.isArray(b.photoFileIds)) doc.photoFileIds = b.photoFileIds;
  if (b.custom !== undefined) { doc.custom = await cleanCustom('quality_fabric', b.custom, doc.custom || {}); doc.markModified('custom'); }
  doc.totalPoints = doc.defects.reduce((a, d) => a + d.p1 + 2 * d.p2 + 3 * d.p3 + 4 * d.p4, 0);
  doc.pointsPer100 = Math.round(doc.totalPoints * 3937 / (doc.metersChecked * doc.widthInches) * 10) / 10;
  doc.pointsPer100Yd = Math.round(doc.totalPoints * 3600 / (doc.metersChecked * 1.09361 * doc.widthInches) * 10) / 10;
  if (b.limit !== undefined) doc.limit = +b.limit || doc.limit;
  doc.result = (doc.unit === 'sqyd' ? doc.pointsPer100Yd : doc.pointsPer100) <= doc.limit ? 'Pass' : 'Fail';
  /* hold follows the result — unless someone already released it by hand (that decision stands) */
  if (doc.result === 'Pass' && doc.hold) {
    if (doc.holdQty > 0) await stock.post({ materialId: doc.materialId, txn: 'release', reservedDelta: -doc.holdQty, refType: 'quality', refId: doc._id, refNo: doc.inspNo, note: `Quality hold released · inspection edited to Pass`, by: req.user.name });
    doc.hold = false; doc.releasedAt = new Date(); doc.releasedBy = req.user.name;
  } else if (doc.result === 'Fail' && !doc.hold && !doc.releasedAt) {
    const m = await Material.findById(doc.materialId);
    doc.holdQty = m ? Math.min(doc.metersChecked, Math.max(m.physicalQty - m.reservedQty, 0)) : 0; doc.hold = true;
    if (doc.holdQty > 0) await stock.post({ materialId: doc.materialId, txn: 'reserve', reservedDelta: doc.holdQty, refType: 'quality', refId: doc._id, refNo: doc.inspNo, note: `Quality hold · ${doc.inspNo} edited to Fail (${doc.pointsPer100} pts/100 sq m, limit ${doc.limit})`, by: req.user.name });
  }
  await doc.save();
  audit.record(req, 'quality.fabric.update', `FabricInspection:${doc.inspNo}`, before, doc.toObject());
  return plain(doc);
};
const fabricRelease = async (req, id, reason) => {
  const doc = await FabricInspection.findById(id);
  if (!doc) throw ApiError.notFound('Inspection not found');
  if (!doc.hold) throw ApiError.badRequest('This lot is not on hold');
  if (!reason) throw ApiError.badRequest('A reason is required to release a quality hold');
  doc.hold = false; doc.releasedAt = new Date(); doc.releasedBy = req.user.name; doc.remarks = `${doc.remarks ? doc.remarks + ' · ' : ''}Released: ${reason}`;
  await doc.save();
  if (doc.holdQty > 0) await stock.post({ materialId: doc.materialId, txn: 'release', reservedDelta: -doc.holdQty, refType: 'quality', refId: doc._id, refNo: doc.inspNo, note: `Quality hold released · ${reason}`, by: req.user.name });
  audit.record(req, 'quality.release', `FabricInspection:${doc.inspNo}`, null, { reason, qty: doc.holdQty });
  return plain(doc);
};

/* ---------- inline / end-line (FR-20.2) ---------- */
const inlineCreate = async (req, b) => {
  const order = await Order.findById(b.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  const checked = Math.round(+b.checked || 0);
  if (checked <= 0) throw ApiError.badRequest('Pieces checked must be greater than zero');
  const master = await defectMaster();
  const defects = (Array.isArray(b.defects) ? b.defects : []).filter((d) => +d.count > 0).map((d) => {
    const m = master.find((x) => x.code === d.code) || {};
    return { code: d.code, name: d.name || m.name || d.code, severity: d.severity || m.severity || 'Major', count: Math.round(+d.count) };
  });
  const total = defects.reduce((a, d) => a + d.count, 0);
  const doc = await InlineInspection.create({
    custom: await cleanCustom('quality_inline', b.custom),
    date: b.date ? new Date(b.date) : new Date(), line: b.line || '', orderId: order._id, orderNo: order.orderNo, op: b.op || 'Stitching', kind: b.kind || 'Inline',
    checked, defects, totalDefects: total, dhu: Math.round(total * 1000 / checked) / 10, inspector: b.inspector || req.user.name, remarks: b.remarks || '', by: req.user.name,
  });
  audit.record(req, 'quality.inline', `InlineInspection:${order.orderNo}/${doc.line}`, null, { checked, total, dhu: doc.dhu });
  return plain(doc);
};

/* ---------- mid / final AQL (FR-20.3) ---------- */
const aqlCreate = async (req, b) => {
  const order = await Order.findById(b.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  const level = b.aqlLevel || (await settings()).aqlLevel || '2.5';
  const lot = Math.round(+b.lotSize || order.qty);
  const plan = aqlPlan(lot, level);
  const master = await defectMaster();
  const defects = (Array.isArray(b.defects) ? b.defects : []).filter((d) => +d.count > 0).map((d) => {
    const m = master.find((x) => x.code === d.code) || {};
    return { code: d.code, name: d.name || m.name || d.code, severity: d.severity || m.severity || 'Major', count: Math.round(+d.count) };
  });
  const majors = b.majors !== undefined ? Math.round(+b.majors) : defects.filter((d) => d.severity === 'Major').reduce((a, d) => a + d.count, 0);
  const minors = b.minors !== undefined ? Math.round(+b.minors) : defects.filter((d) => d.severity !== 'Major').reduce((a, d) => a + d.count, 0);
  const auto = majors <= plan.acceptNo ? 'Pass' : 'Fail';
  const result = b.result === 'Hold' ? 'Hold' : (b.result || auto);
  const stage = b.stage === 'Mid' ? 'Mid' : 'Final';
  const doc = await AqlInspection.create({
    custom: await cleanCustom('quality_aql', b.custom), inspNo: `QI-${pad(await nextSeq('aqlInsp'), 4)}`, orderId: order._id, orderNo: order.orderNo, styleNo: order.styleNo, stage,
    date: b.date ? new Date(b.date) : new Date(), site: b.site || 'Unit 1 — Noida', inspectorType: b.inspectorType || 'Internal', inspector: b.inspector || req.user.name,
    merchandiser: b.merchandiser || '', colour: b.colour || order.colour, sampling: b.sampling || 'Normal', aqlLevel: level, lotSize: lot,
    sampleSize: +b.sampleSize || plan.sampleSize, acceptNo: plan.acceptNo, rejectNo: plan.rejectNo, majors, minors, defects,
    cartonsOpened: +b.cartonsOpened || 0, cartonsTotal: +b.cartonsTotal || 0, checks: b.checks || {}, result, holdReason: b.holdReason || '',
    poQty: Math.max(Math.round(+b.poQty || 0), 0) || order.qty, poDate: b.poDate ? new Date(b.poDate) : (order.createdAt || undefined), shippedQty: Math.max(Math.round(+b.shippedQty || 0), 0), refNo: String(b.refNo || ''),
    foundMajors: majors, allowedMajors: plan.acceptNo,
    blocksDispatch: stage === 'Final' && result !== 'Pass', reportFileId: b.reportFileId || undefined, photoFileIds: Array.isArray(b.photoFileIds) ? b.photoFileIds : [],
    remarks: b.remarks || '', by: req.user.name,
  });
  await Order.updateOne({ _id: order._id }, { $push: { activity: { by: req.user.name, text: `${stage} inspection ${doc.inspNo}: ${result} · ${majors} major / ${minors} minor on ${doc.sampleSize} pcs (AQL ${level})${doc.blocksDispatch ? ' · DISPATCH BLOCKED' : ''}` } } });
  if (stage === 'Final' && result === 'Pass') await require('../tna/tna.service').markEvent(order._id, 'final_inspection', doc.date, `AQL ${doc.inspNo}`);
  audit.record(req, 'quality.aql', `AqlInspection:${doc.inspNo}`, null, { order: order.orderNo, stage, result, majors, minors });
  log.info(`${doc.inspNo} · ${order.orderNo} ${stage} · ${result} · ${majors}M/${minors}m on ${doc.sampleSize}`);
  return plain(doc);
};

/* ---------- measurement inspection (AFN/22) ---------- */
const measurementCreate = async (req, b) => {
  const order = await Order.findById(b.orderId);
  if (!order) throw ApiError.badRequest('Order is required');
  const Style = require('../styles/style.model');
  const style = order.styleId ? await Style.findById(order.styleId) : null;
  const size = String(b.size || '').trim();
  if (!size) throw ApiError.badRequest('Size is required');
  const pom = style ? style.pom : [];
  const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r) => r && r.code).map((r) => {
    const p = pom.find((x) => x.code === r.code) || {};
    const spec = r.spec !== undefined && r.spec !== '' ? +r.spec : (p.spec && p.spec[size] !== undefined ? +p.spec[size] : NaN);
    const tolerance = r.tolerance !== undefined && r.tolerance !== '' ? +r.tolerance : (p.tolerance ?? 0.5);
    const measured = (Array.isArray(r.measured) ? r.measured : []).map((v) => (v === '' || v === null || v === undefined ? NaN : +v)).filter((v) => !Number.isNaN(v));
    const devs = Number.isNaN(spec) ? [] : measured.map((v) => Math.abs(v - spec));
    const maxDev = devs.length ? Math.round(Math.max(...devs) * 100) / 100 : 0;
    return { code: String(r.code), name: r.name || p.name || String(r.code), spec: Number.isNaN(spec) ? undefined : spec, tolerance, measured, maxDev, pass: !devs.length || maxDev <= tolerance + 1e-9 };
  });
  if (!rows.length) throw ApiError.badRequest('Enter at least one measurement row');
  const failed = rows.filter((r) => !r.pass).length;
  const doc = await MeasurementInspection.create({
    inspNo: `MI-${pad(await nextSeq('measureInsp'), 4)}`, orderId: order._id, orderNo: order.orderNo, styleNo: order.styleNo, stage: ['Inline', 'Pre-final', 'Final'].includes(b.stage) ? b.stage : 'Final',
    date: b.date ? new Date(b.date) : new Date(), colour: String(b.colour || ''), size, unit: style ? style.pomUnit : 'cm', pieces: Math.max(...rows.map((r) => r.measured.length), 0), rows,
    passed: rows.length - failed, failed, result: failed ? 'Fail' : 'Pass', inspector: b.inspector || req.user.name, remarks: String(b.remarks || ''), by: req.user.name,
  });
  await Order.updateOne({ _id: order._id }, { $push: { activity: { by: req.user.name, text: `Measurement inspection ${doc.inspNo} · size ${size}: ${doc.result} (${failed} of ${rows.length} POM out of tolerance)` } } });
  audit.record(req, 'quality.measure', `MeasurementInspection:${doc.inspNo}`, null, { order: order.orderNo, size, result: doc.result, failed });
  return plain(doc);
};

/* ---------- broken needle (AFN/17) & blade (AFN/13) registers ---------- */
const needleCreate = async (req, b) => {
  const parts = { point: !!(b.parts && b.parts.point), shank: !!(b.parts && b.parts.shank), eye: !!(b.parts && b.parts.eye), middle: !!(b.parts && b.parts.middle) };
  const doc = await NeedleRecord.create({ date: b.date ? new Date(b.date) : new Date(), time: String(b.time || new Date().toTimeString().slice(0, 5)), line: String(b.line || ''), machineNo: String(b.machineNo || ''), operator: String(b.operator || ''),
    orderNo: String(b.orderNo || ''), needleType: String(b.needleType || ''), needleSize: String(b.needleSize || ''), parts, allFound: b.allFound === undefined ? Object.values(parts).every(Boolean) : !!b.allFound,
    garmentChecked: !!b.garmentChecked, newIssued: b.newIssued === undefined ? true : !!b.newIssued, supervisor: String(b.supervisor || req.user.name), remarks: String(b.remarks || ''), by: req.user.name });
  audit.record(req, 'quality.needle', `NeedleRecord:${doc._id}`, null, { machine: doc.machineNo, allFound: doc.allFound });
  return plain(doc);
};
const bladeCreate = async (req, b) => {
  const kind = String(b.kind || 'Cutting blade');
  const last = await BladeRecord.findOne({ kind }).sort('-date -createdAt');
  const received = Math.max(Math.round(+b.received || 0), 0), issued = Math.max(Math.round(+b.issued || 0), 0), broken = Math.max(Math.round(+b.broken || 0), 0), returned = Math.max(Math.round(+b.returned || 0), 0);
  const balance = (last ? last.balance : 0) + received - issued + returned;   // running stock of blades in the store (broken ones are exchanged one-for-one)
  if (balance < 0) throw ApiError.badRequest(`Only ${last ? last.balance : 0} ${kind.toLowerCase()}(s) in the store — cannot issue ${issued}`);
  const doc = await BladeRecord.create({ date: b.date ? new Date(b.date) : new Date(), kind, received, issued, broken, returned, balance, issuedTo: String(b.issuedTo || ''), machineNo: String(b.machineNo || ''), remarks: String(b.remarks || ''), by: req.user.name });
  audit.record(req, 'quality.blade', `BladeRecord:${doc._id}`, null, { kind, received, issued, broken, balance });
  return plain(doc);
};

/** Latest final-inspection verdict for the Control Tower (gate 8) */
const orderQc = async (orderId) => {
  const final = await AqlInspection.findOne({ orderId, stage: 'Final' }).sort('-date -createdAt');
  const mid = await AqlInspection.findOne({ orderId, stage: 'Mid' }).sort('-date -createdAt');
  return { final: final ? { inspNo: final.inspNo, result: final.result, date: final.date, blocksDispatch: final.blocksDispatch } : null,
    mid: mid ? { inspNo: mid.inspNo, result: mid.result, date: mid.date } : null };
};

/* ---------- summary + rejection analysis (FR-20.4/5) ---------- */
const summary = async () => {
  const s = await settings();
  const since7 = new Date(Date.now() - 7 * 864e5);
  const inl = await InlineInspection.find({ date: { $gte: since7 } });
  const today = inl.filter((i) => i.date >= startOfDay());
  const dhu = (rows) => { const c = rows.reduce((a, r) => a + r.checked, 0), d = rows.reduce((a, r) => a + r.totalDefects, 0); return c ? Math.round(d * 1000 / c) / 10 : 0; };
  const holds = await FabricInspection.find({ hold: true });
  const failedFinal = await AqlInspection.find({ stage: 'Final', result: { $ne: 'Pass' } }).sort('-date');
  const openOrders = await Order.find({ status: 'Open' });
  const finals = await AqlInspection.find({ stage: 'Final', result: 'Pass' });
  const passed = new Set(finals.map((f) => String(f.orderId)));
  const due = openOrders.filter((o) => !passed.has(String(o._id)) && o.shipDate && (o.shipDate - Date.now()) / 864e5 <= 7);
  return {
    dhuToday: dhu(today), dhu7: dhu(inl), dhuLimit: s.dhuLimit || 5, checkedToday: today.reduce((a, r) => a + r.checked, 0),
    holds: holds.map((h) => ({ id: h._id, inspNo: h.inspNo, materialCode: h.materialCode, qty: h.holdQty, days: Math.floor((Date.now() - h.date) / 864e5) })),
    failedFinal: failedFinal.map((f) => ({ id: f._id, inspNo: f.inspNo, orderNo: f.orderNo, result: f.result })),
    finalDue: due.map((o) => ({ orderId: o._id, orderNo: o.orderNo, shipDate: o.shipDate })),
    fabricPointsLimit: s.fabricPointsLimit || 20, aqlLevel: s.aqlLevel || '2.5',
  };
};

const rejections = async (req, q = {}) => {
  const since = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 864e5);
  const inl = await InlineInspection.find({ date: { $gte: since } });
  const aql = await AqlInspection.find({ date: { $gte: since } });
  const byType = {}, byLine = {}, byOrder = {};
  const add = (map, k, n) => { if (!k) return; map[k] = (map[k] || 0) + n; };
  inl.forEach((i) => { i.defects.forEach((d) => add(byType, d.name, d.count)); add(byLine, i.line || '—', i.totalDefects); add(byOrder, i.orderNo, i.totalDefects); });
  aql.forEach((i) => { i.defects.forEach((d) => add(byType, d.name, d.count)); add(byOrder, i.orderNo, i.majors + i.minors); });
  const { vendorLabel } = require('../../common/utils/mask');
  const jws = await JobWork.find({ rejectedQty: { $gt: 0 }, outDate: { $gte: since } });
  const byVendor = {};
  jws.forEach((j) => add(byVendor, vendorLabel(req.user, j.vendorName, j.vendorAlias, j.process), j.rejectedQty));
  const sorted = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return { since, byType: sorted(byType), byLine: sorted(byLine), byOrder: sorted(byOrder), byVendor: sorted(byVendor),
    totalInline: inl.reduce((a, i) => a + i.totalDefects, 0), totalChecked: inl.reduce((a, i) => a + i.checked, 0) };
};

module.exports = { aqlPlan, defectMaster, fabricCreate, fabricUpdate, fabricRelease, inlineCreate, aqlCreate, orderQc, summary, rejections, measurementCreate, needleCreate, bladeCreate, FABRIC_CATEGORIES };
