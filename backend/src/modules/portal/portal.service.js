const crypto = require('crypto');
const ApiError = require('../../common/utils/api-error');
const { plain } = require('../../common/utils/mask');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Tracking = require('./tracking.model');
const Order = require('../orders/order.model');
const Buyer = require('../buyers/buyer.model');
const Style = require('../styles/style.model');
const Sample = require('../samples/sample.model');
const User = require('../users/user.model');
const Dispatch = require('../dispatch/dispatch.model');
const dispatchSvc = require('../dispatch/dispatch.service');
const tna = require('../tna/tna.service');
const { TnaTask } = require('../tna/tna.model');
const log = logger.child({ context: 'Portal' });

const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           // no 0/O/1/I — read out over the phone
const newToken = () => { const b = crypto.randomBytes(8); const s = [...b].map((x) => ALPHABET[x % ALPHABET.length]).join(''); return `${s.slice(0, 4)}-${s.slice(4)}`; };
const env = require('../../config/env');
const baseUrl = (cfg) => (cfg.portalBaseUrl || env.corsOrigins[0] || 'http://localhost:5173').replace(/\/$/, '');

const presentCode = (doc, cfg) => {
  const t = plain(doc);
  t.url = `${baseUrl(cfg)}/track/${t.token}`;
  t.hasPin = !!t.pinHash; delete t.pinHash;
  t.secretLabel = t.secretKind === 'password' ? 'Password' : 'PIN';
  t.status = t.revokedAt ? 'Revoked' : t.expiresAt && new Date(t.expiresAt) < new Date() ? 'Expired' : 'Active';
  t.views = (t.views || []).slice(-50).reverse();
  return t;
};

/* ---------- internal: issue / list / revoke ---------- */
const issue = async (req, b) => {
  const cfg = await settings();
  const doc = { token: newToken(), kind: b.kind === 'buyer' ? 'buyer' : 'order', createdBy: req.user.uid, label: b.label || '' };
  if (doc.kind === 'order') {
    const o = await Order.findById(b.orderId);
    if (!o) throw ApiError.badRequest('Order is required');
    doc.orderId = o._id; doc.orderNo = o.orderNo; doc.buyerId = o.buyerId; doc.buyerAlias = o.buyerAlias;
  } else {
    const buyer = await Buyer.findById(b.buyerId);
    if (!buyer) throw ApiError.badRequest('Buyer is required');
    if (buyer.portalMasterLink === false) throw ApiError.badRequest('Buyer-wise master link is switched off for this buyer');
    doc.buyerId = buyer._id; doc.buyerAlias = buyer.alias;
  }
  if (b.password) {
    if (String(b.password).trim().length < 6) throw ApiError.badRequest('Password must be at least 6 characters');
    doc.pinHash = sha(String(b.password).trim()); doc.secretKind = 'password';
  } else if (b.pin) { if (!/^\d{4,6}$/.test(String(b.pin))) throw ApiError.badRequest('PIN must be 4–6 digits'); doc.pinHash = sha(b.pin); doc.secretKind = 'pin'; }
  doc.detail = b.detail === 'full' ? 'full' : 'stages';
  const days = +b.expiresInDays > 0 ? Math.min(+b.expiresInDays, 730) : (cfg.portalDefaultDays || 90);
  doc.expiresAt = new Date(Date.now() + days * 864e5);
  const t = await Tracking.create(doc);
  if (t.orderId) await Order.updateOne({ _id: t.orderId }, { $push: { activity: { by: req.user.name, text: `Tracking code ${t.token} shared with the buyer · ${t.detail === 'full' ? 'full T&A plan' : 'stage board'} · valid ${days} days${t.pinHash ? ` · ${t.secretKind} protected` : ''}` } } });
  audit.record(req, 'portal.issue', `Tracking:${t.token}`, null, { kind: t.kind, order: t.orderNo, buyer: t.buyerAlias, days, pin: !!t.pinHash });
  log.info(`tracking ${t.token} · ${t.kind} · ${t.orderNo || t.buyerAlias} · by ${req.user.uid}`);
  return presentCode(t, cfg);
};
const list = async (req, q = {}) => {
  const cfg = await settings();
  const f = {};
  if (q.orderId) f.orderId = q.orderId;
  if (q.buyerId) f.buyerId = q.buyerId;
  if (q.kind) f.kind = q.kind;
  const rows = await Tracking.find(f).sort('-createdAt').limit(200);
  return { items: rows.map((r) => presentCode(r, cfg)), total: rows.length };
};
const revoke = async (req, id) => {
  const t = await Tracking.findById(id);
  if (!t) throw ApiError.notFound('Tracking code not found');
  t.revokedAt = new Date(); t.revokedBy = req.user.name;
  await t.save();
  audit.record(req, 'portal.revoke', `Tracking:${t.token}`);
  return presentCode(t, await settings());
};

/* ---------- public: whitelisted snapshot (FR-22.3/4) — nothing else leaves this function ---------- */
// buyer-visible stages come from Settings (TNA → Stages, “show to buyer”) — money stages stay off the portal by default
const orderSnapshot = async (order, cfg, full = false) => {
  const tasks = await TnaTask.find({ orderId: order._id }).sort('seq');
  const allStages = await tna.stagesCfg();
  const STAGES = allStages.filter((s) => s.portal).map((s) => s.name);
  const roll = tna.rollup(tasks.map((t) => tna.present(t, { role: 'Admin' }, cfg.tnaAmberDays || 3)), allStages.map((s) => s.name));
  const style = order.styleId ? await Style.findById(order.styleId) : null;
  const sample = order.sampleId ? await Sample.findById(order.sampleId) : null;
  const merch = sample && sample.merchandiser ? await User.findOne({ name: sample.merchandiser }) : await User.findOne({ uid: order.createdBy });
  const shipped = (await Dispatch.find({ orderId: order._id }).sort('-invoiceDate')).map((d) => ({ d, status: dispatchSvc.statusOf(d) })).find((x) => ['Shipped On Board', 'In Transit', 'Delivered'].includes(x.status));
  const stages = STAGES.map((s) => {
    const c = roll.stages.find((x) => x.stage === s) || { total: 0, done: 0, rag: 'none', next: null, actualEnd: null };
    const planned = tasks.filter((t) => t.stage === s).reduce((a, t) => (t.plannedEnd > a ? t.plannedEnd : a), null);
    return { stage: s, status: c.total === 0 ? 'Not planned' : c.rag === 'done' ? 'Completed' : c.done > 0 ? 'In progress' : 'Planned', rag: c.rag === 'none' ? 'grey' : c.rag,
      planned, actual: c.actualEnd || null, done: c.done, total: c.total };
  });
  return {
    ref: { buyerPo: order.buyerPoNo || '', styleNo: order.styleNo }, description: order.description, colour: order.colour || '',
    hasImage: !!(style && style.imageFileId), qty: order.qty, shipDate: order.shipDate, status: order.status === 'Closed' ? 'Closed' : order.stage,
    progress: order.progress || 0, health: tna.worst(stages.map((s) => s.rag).filter((r) => r !== 'grey' && r !== 'done')), stages,
    dispatch: shipped ? { mode: shipped.d.mode, status: shipped.status, vesselOrFlight: shipped.d.vesselOrFlight || '', blOrAwbNo: shipped.d.blOrAwbNo || '', portOfLoading: shipped.d.portOfLoading, portOfDischarge: shipped.d.portOfDischarge, eta: shipped.d.eta || null,
      events: shipped.d.tracking.filter((t) => t.done).map((t) => ({ title: t.title, at: t.at })) } : null,
    merchandiser: merch ? { name: merch.name, email: merch.email || cfg.email || '', phone: merch.phone || cfg.phone || '' } : { name: 'Merchandising', email: cfg.email || '', phone: cfg.phone || '' },
    ...(full ? await fullDetail(order, tasks, roll) : {}),
  };
};

/** Everything the buyer may see about their own order: the plan activity by activity, the floor, QC, packing, shipments. */
const fullDetail = async (order, tasks, roll) => {
  const { ProductionOp } = require('../production/production.model');
  const { AqlInspection } = require('../quality/quality.model');
  const ops = await ProductionOp.find({ orderId: order._id }).sort('seq');
  const qc = await AqlInspection.find({ orderId: order._id }).sort('-date').limit(6);
  const shipments = await Dispatch.find({ $or: [{ orderId: order._id }, { 'lines.orderId': order._id }] }).sort('-invoiceDate');
  const photos = (await require('../orders/orders.service').photosOf([order]))[String(order._id)] || { photos: [] };
  const day = (v) => (v ? new Date(v) : null);
  return {
    photoCount: (photos.photos || []).length,
    fabric: order.fabric || '', sizeRange: order.sizeRange || '', poNo: order.buyerPoNo || '', buyerOrderNo: order.buyerOrderNo || '',
    sizes: (order.sizes || []).map((x) => ({ size: x.size, qty: x.qty })),
    colours: (order.colours || []).map((c) => ({ code: c.code, name: c.name, qty: c.qty, sizes: (c.sizes || []).map((s) => ({ size: s.size, qty: s.qty })) })),
    progressPct: order.progress || 0, cutQty: order.cutQty || 0,
    plan: tasks.map((t) => ({ seq: t.seq, activity: t.activity, stage: t.stage, dept: t.dept, owner: t.ownerName || '',
      plannedStart: day(t.plannedStart), plannedEnd: day(t.plannedEnd), actualEnd: day(t.actualEnd), status: t.status,
      late: !!(t.actualEnd && new Date(t.actualEnd) > new Date(t.plannedEnd)), remark: t.remark || '' })),
    planDone: roll.done, planTotal: roll.total,
    production: ops.map((o) => ({ op: o.op, planned: o.plannedQty, done: o.doneQty, rejected: o.rejectedQty || 0, state: o.state })),
    quality: qc.map((q) => ({ stage: q.stage, result: q.result, date: q.date, lotSize: q.lotSize, defects: (q.defects || []).reduce((a, d) => a + (d.count || 0), 0) })),
    packing: shipments.length ? { cartons: shipments.reduce((a, d) => a + (d.cartons || 0), 0), pcs: shipments.reduce((a, d) => a + (d.qty || 0), 0) } : null,
    shipments: shipments.map((d) => ({ invoiceNo: d.invoiceNo, date: d.invoiceDate, mode: d.mode, status: dispatchSvc.statusOf(d),
      qty: (d.lines || []).filter((l) => String(l.orderId) === String(order._id)).reduce((a, l) => a + l.qty, 0) || d.qty,
      cartons: d.cartons, grossKg: d.grossWeightKg, netKg: d.netWeightKg, route: `${d.portOfLoading} → ${d.portOfDischarge}`,
      vesselOrFlight: d.vesselOrFlight || '', blOrAwbNo: d.blOrAwbNo || '', eta: d.eta || null,
      events: (d.tracking || []).filter((x) => x.done).map((x) => ({ title: x.title, at: x.at })),
      documents: (d.documents || []).map((x) => ({ type: x.type, status: x.status })) })),
  };
};

const view = async (token, pin, meta = {}) => {
  const t = await Tracking.findOne({ token: String(token || '').toUpperCase().trim() });
  if (!t) throw ApiError.notFound('This tracking link is not valid');
  const logView = async (ok) => { t.views.push({ ip: meta.ip || '', ua: (meta.ua || '').slice(0, 160), ok }); if (t.views.length > 500) t.views = t.views.slice(-500); if (ok) { t.viewCount += 1; t.lastViewedAt = new Date(); } await t.save(); };
  if (t.revokedAt) { await logView(false); throw new ApiError(410, 'This tracking link has been revoked', 'REVOKED'); }
  if (t.expiresAt && t.expiresAt < new Date()) { await logView(false); throw new ApiError(410, 'This tracking link has expired', 'EXPIRED'); }
  if (t.pinHash) {
    const word = t.secretKind === 'password' ? 'PASSWORD' : 'PIN';
    if (!pin) throw new ApiError(401, `${t.secretKind === 'password' ? 'Password' : 'PIN'} required`, `${word}_REQUIRED`);
    if (sha(String(pin).trim()) !== t.pinHash) { await logView(false); throw new ApiError(401, `Incorrect ${t.secretKind === 'password' ? 'password' : 'PIN'}`, `${word}_WRONG`); }
  }
  const cfg = await settings();
  const company = { name: cfg.legalName || 'Afion International', email: cfg.email || '', phone: cfg.phone || '' };
  let payload;
  if (t.kind === 'order') {
    const o = await Order.findById(t.orderId);
    if (!o) throw ApiError.notFound('Order no longer available');
    payload = { kind: 'order', company, detail: t.detail, order: await orderSnapshot(o, cfg, t.detail === 'full') };
  } else {
    const orders = await Order.find({ buyerId: t.buyerId, status: 'Open' }).sort('shipDate');
    payload = { kind: 'buyer', company, detail: t.detail, orders: [] };
    for (const o of orders) payload.orders.push({ id: String(o._id), ...(await orderSnapshot(o, cfg, t.detail === 'full')) });
  }
  await logView(true);
  return payload;
};

/** Style image for the portal — only through a valid token, never a file id. */
const imageFor = async (token, pin, orderId, idx = 0) => {
  const t = await Tracking.findOne({ token: String(token || '').toUpperCase().trim() });
  if (!t || t.revokedAt || (t.expiresAt && t.expiresAt < new Date())) throw ApiError.notFound('Not available');
  if (t.pinHash && sha(String(pin || '').trim()) !== t.pinHash) throw new ApiError(401, 'Not allowed', 'PIN_REQUIRED');
  const oid = t.kind === 'order' ? t.orderId : orderId;
  const o = oid ? await Order.findOne({ _id: oid, ...(t.kind === 'buyer' ? { buyerId: t.buyerId } : {}) }) : null;
  if (!o) return null;
  const shot = (await require('../orders/orders.service').photosOf([o]))[String(o._id)] || { photos: [] };
  if (shot.photos && shot.photos.length) return shot.photos[Math.min(Math.max(parseInt(idx, 10) || 0, 0), shot.photos.length - 1)];
  const style = o.styleId ? await Style.findById(o.styleId) : null;
  return style && style.imageFileId ? style.imageFileId : null;
};

module.exports = { issue, list, revoke, view, imageFor, presentCode };
