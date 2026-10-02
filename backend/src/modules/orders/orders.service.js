const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const crud = require('../../common/utils/crud');
const { plain, buyerLabel } = require('../../common/utils/mask');
const { nextSeq } = require('../../common/utils/counters');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Order = require('./order.model');
const Sample = require('../samples/sample.model');
const Style = require('../styles/style.model');
const Po = require('../po/po.model');
const stock = require('../stock/stock.service');
const log = logger.child({ context: 'OrdersService' });

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const DEFAULT_PCT = [12, 24, 28, 22, 10, 4];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR'];
const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
const money = (n) => Math.round((+n || 0) * 100) / 100;

/**
 * Colour-wise order (buyer colour code × size matrix). qty per colour = Σ sizes when a size grid is typed, else the colour qty;
 * cut qty = ceil(qty × (1 + cut extra %)). Returns { colours, sizes (Σ per size), qty, cutQty } or null when no colour rows.
 */
const normColours = (raw, sizeSet, extraPct) => {
  const rows = (Array.isArray(raw) ? raw : []).filter((c) => c && (String(c.code || '').trim() || String(c.name || '').trim()));
  if (!rows.length) return null;
  const up = (1 + (Math.max(+extraPct || 0, 0)) / 100);
  const colours = rows.map((c) => {
    const grid = (Array.isArray(c.sizes) ? c.sizes : []).filter((s) => s && String(s.size || '').trim()).map((s) => ({ size: String(s.size).trim(), qty: Math.max(Math.round(+s.qty || 0), 0), barcode: String(s.barcode || '').trim() }));
    const qty = grid.length ? grid.reduce((a, s) => a + s.qty, 0) : Math.max(Math.round(+c.qty || 0), 0);
    return { code: String(c.code || '').trim(), name: String(c.name || '').trim(), qty, cutQty: Math.ceil(qty * up),
      sizes: grid.map((s) => ({ ...s, cutQty: Math.ceil(s.qty * up) })) };
  });
  const qty = colours.reduce((a, c) => a + c.qty, 0);
  const bySize = {};
  colours.forEach((c) => c.sizes.forEach((s) => { bySize[s.size] = (bySize[s.size] || 0) + s.qty; }));
  const order = sizeSet && sizeSet.length ? sizeSet : Object.keys(bySize);
  const sizes = order.filter((s) => bySize[s] !== undefined || (sizeSet || []).includes(s)).map((size) => ({ size, qty: bySize[size] || 0, pct: qty ? Math.round((bySize[size] || 0) * 1000 / qty) / 10 : 0 }));
  return { colours, sizes, qty, cutQty: colours.reduce((a, c) => a + c.cutQty, 0) };
};
const cleanSizeSet = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,/]/)).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20);
/** Fields whose change is a buyer-visible order revision (FR: purchase-note revisions). */
const REVISED = ['qty', 'cutQty', 'unitPrice', 'fxRate', 'currency', 'shipDate', 'targetShipDate', 'deliveryDate', 'cancelledQty', 'buyerPoNo', 'paymentTerms', 'mode'];
const fmtV = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === undefined || v === null ? '' : String(v));

const present = (doc, user) => {
  const o = plain(doc);
  o.buyerName = buyerLabel(user, o.buyerBrand, o.buyerAlias);
  if (!hasFlag(user, 'rates.view')) { delete o.fobRate; delete o.unitPrice; delete o.firstPrice; o.value = undefined; }
  else { o.value = Math.round((o.fobRate || 0) * (o.qty || 0)); o.valueFx = money((o.unitPrice || 0) * (o.qty || 0)); }
  o.balanceQty = Math.max((o.qty || 0) - (o.shippedQty || 0) - (o.cancelledQty || 0), 0);
  return o;
};

const sizeGrid = (qty, pcts) => {
  const p = (Array.isArray(pcts) && pcts.length === 6 ? pcts : DEFAULT_PCT).map((x) => +x || 0);
  const total = p.reduce((a, b) => a + b, 0) || 100;
  return SIZES.map((size, i) => ({ size, pct: p[i], qty: Math.round(qty * p[i] / total) }));
};

const base = crud(Order, {
  label: 'order',
  form: 'orders',
  search: ['orderNo', 'styleNo', 'description', 'buyerBrand', 'buyerAlias', 'buyerPoNo'],
  filters: ['status', 'stage', 'buyerId', 'priority'],
  present,
  beforeCreate: async () => { throw ApiError.badRequest('Orders are created from an approved sample'); },
  beforeUpdate: async (body, req, doc) => {
    const { orderNo, sampleId, sampleNo, buyerId, buyerBrand, buyerAlias, activity, revision, revisions, revisionReason, shippedQty, ...rest } = body;
    if (rest.sizeSet !== undefined) rest.sizeSet = cleanSizeSet(rest.sizeSet);
    if (rest.colours !== undefined) {
      const c = normColours(rest.colours, rest.sizeSet || doc.sizeSet, rest.cutExtraPct !== undefined ? rest.cutExtraPct : doc.cutExtraPct);
      if (c) Object.assign(rest, c); else rest.colours = [];
    }
    if (rest.qty && rest.sizePcts) rest.sizes = sizeGrid(+rest.qty, rest.sizePcts);
    if (rest.currency && !CURRENCIES.includes(rest.currency)) throw ApiError.badRequest('Currency must be one of ' + CURRENCIES.join(', '));
    if (rest.unitPrice !== undefined || rest.fxRate !== undefined) {
      if (!hasFlag(req.user, 'rates.view')) throw ApiError.forbidden('Prices need the rates.view flag');
      const price = rest.unitPrice !== undefined ? money(rest.unitPrice) : doc.unitPrice, fx = rest.fxRate !== undefined ? +rest.fxRate || 1 : doc.fxRate || 1;
      rest.unitPrice = price; rest.fxRate = fx; rest.fobRate = money(price * fx);
    }
    if (rest.firstPrice !== undefined) rest.firstPrice = money(rest.firstPrice);
    if (rest.cancelledQty !== undefined) rest.cancelledQty = Math.max(Math.round(+rest.cancelledQty || 0), 0);
    ['shipDate', 'targetShipDate', 'deliveryDate'].forEach((k) => { if (rest[k] !== undefined) rest[k] = rest[k] ? new Date(rest[k]) : undefined; });
    /* revision log — any commercial change bumps the revision number and records what moved (buyer purchase-note revisions) */
    const changes = REVISED.filter((k) => rest[k] !== undefined && fmtV(rest[k]) !== fmtV(doc[k])).map((k) => ({ field: k, from: fmtV(doc[k]), to: fmtV(rest[k]) }));
    if (rest.colours && JSON.stringify(rest.colours.map((c) => [c.code, c.qty, c.sizes.map((s) => [s.size, s.qty])])) !== JSON.stringify((doc.colours || []).map((c) => [c.code, c.qty, c.sizes.map((s) => [s.size, s.qty])]))) changes.push({ field: 'colours', from: `${(doc.colours || []).length} colour(s) · ${doc.qty} pcs`, to: `${rest.colours.length} colour(s) · ${rest.qty} pcs` });
    if (changes.length) {
      rest.revision = (doc.revision || 0) + 1;
      rest.revisions = [...doc.revisions.map((r) => r.toObject()), { no: rest.revision, by: req.user.name, reason: String(revisionReason || '').trim(), changes }];
      doc.activity.push({ by: req.user.name, text: `Revision ${rest.revision}: ${changes.map((c) => `${c.field} ${c.from || '—'} → ${c.to || '—'}`).join(', ')}${revisionReason ? ` · ${revisionReason}` : ''}` });
      if (rest.qty !== undefined || rest.cutQty !== undefined) require('../production/production.service').syncPlanned({ ...doc.toObject(), ...rest }).catch(() => {});
    }
    if (rest.stage && rest.stage !== doc.stage) {
      doc.activity.push({ by: req.user.name, text: `Stage moved to ${rest.stage}` });
    }
    delete rest.sizePcts;
    return rest;
  },
});

/** The only creation path (FR-3.1): approved sample → order, carried fields locked. */
const createFromSample = async (req, sampleId, body) => {
  const s = await Sample.findById(sampleId);
  if (!s) throw ApiError.notFound('Sample not found');
  if (s.status !== 'Approved') throw ApiError.badRequest('Only an approved sample can be converted to an order');
  if (s.orderId) throw ApiError.conflict(`Sample already converted to order ${s.orderNo}`);
  const cfg = await settings();
  const sizeSet = cleanSizeSet(body.sizeSet);
  const extra = body.cutExtraPct !== undefined ? Math.max(+body.cutExtraPct || 0, 0) : (cfg.cutExtraPct ?? 5);
  const col = normColours(body.colours, sizeSet, extra);
  const qty = col ? col.qty : parseInt(body.qty, 10);
  if (!qty || qty < 1) throw ApiError.badRequest('Order quantity is required');
  const spec = s.specSheets.length ? s.specSheets[s.specSheets.length - 1] : null;
  const BuyerOrder = require('./buyer-order.model');
  const bo = body.buyerOrderId ? await BuyerOrder.findById(body.buyerOrderId) : null;
  if (body.buyerOrderId && !bo) throw ApiError.badRequest('Buyer order not found');
  if (bo && String(bo.buyerId) !== String(s.buyerId)) throw ApiError.badRequest(`${bo.poNo} belongs to another buyer`);
  const currency = body.currency || (bo && bo.currency) || cfg.defaultCurrency || 'USD';
  if (!CURRENCIES.includes(currency)) throw ApiError.badRequest('Currency must be one of ' + CURRENCIES.join(', '));
  const canRate = hasFlag(req.user, 'rates.view');
  const fx = currency === 'INR' ? 1 : (+body.fxRate || (bo && bo.fxRate) || cfg.fxRate || 1);
  const unitPrice = canRate ? money(body.unitPrice !== undefined ? body.unitPrice : (body.fobRate || 0) / fx) : 0;

  const order = await Order.create({
    custom: await cleanCustom('orders', body.custom),
    orderNo: `AFI-${await nextSeq('order', 1042)}`,
    sampleId: s._id, sampleNo: s.sampleNo, sampleRound: s.round,
    styleId: s.styleId, styleNo: s.styleNo, description: s.description,
    buyerId: s.buyerId, buyerBrand: s.buyerBrand, buyerAlias: s.buyerAlias,
    buyerPoNo: body.buyerPoNo || (bo ? bo.poNo : ''), fabric: s.fabric, colour: col ? col.colours.map((c) => c.name || c.code).join(' / ') : s.colour,
    sizeRange: s.sizeRange, accessories: s.accessories,
    qty, cutQty: col ? col.cutQty : (parseInt(body.cutQty, 10) || Math.ceil(qty * (1 + extra / 100))),
    sizes: col ? col.sizes : sizeGrid(qty, body.sizePcts), sizeSet: sizeSet.length ? sizeSet : (col ? col.sizes.map((x) => x.size) : SIZES), colours: col ? col.colours : [], cutExtraPct: extra,
    currency, unitPrice, firstPrice: canRate ? money(body.firstPrice !== undefined ? body.firstPrice : unitPrice) : 0, fxRate: fx, fobRate: canRate ? money(unitPrice * fx) : 0,
    buyerOrderId: bo ? bo._id : undefined, buyerOrderNo: bo ? bo.poNo : '',
    shipDate: body.shipDate ? new Date(body.shipDate) : (bo && bo.latestShipment) || undefined, targetShipDate: body.targetShipDate ? new Date(body.targetShipDate) : undefined,
    deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : (bo && bo.deliveryDate) || undefined, salesMonth: body.salesMonth || (bo && bo.salesMonth) || '',
    paymentTerms: body.paymentTerms || (bo && bo.terms) || undefined, mode: body.mode || 'Sea', priority: body.priority || 'Normal',
    instructions: body.instructions || '',
    specSheet: spec ? { version: spec.version, fileId: spec.fileId, fileName: spec.fileName, kind: spec.kind } : undefined,
    createdBy: req.user.uid,
    activity: [{ by: req.user.name, text: `Order confirmed from ${s.sampleNo} (round ${s.round})` }],
  });
  s.orderId = order._id; s.orderNo = order.orderNo;
  await s.save();
  /* TNA: default template + events already true at creation (FR-19.2/3) */
  try {
    const tna = require('../tna/tna.service');
    const cfg = (await require('../settings/settings.routes').getCompany()).toObject();
    if (cfg.tnaAutoApply !== false) await tna.applyTemplate(null, order);
    await tna.markEvent(order._id, 'order', order.createdAt, 'order confirmation');
    await tna.markEvent(order._id, 'pp_sample', s.approvedAt || order.createdAt, `sample ${s.sampleNo}`);
    if (spec) await tna.markEvent(order._id, 'spec', order.createdAt, 'specification sheet');
  } catch (e) { log.warn(`TNA not applied to ${order.orderNo}: ${e.message}`); }
  /* the sample's material sheet becomes the style's BOM — the merchant never types the materials twice (an existing BOM is left alone) */
  if (s.materials && s.materials.length) {
    try {
      const existing = await require('../bom/bom.model').findOne({ styleId: s.styleId });
      if (!existing || !existing.lines.length) {
        const built = await require('../bom/bom.service').buildFromSample(req, s, { createMissing: true });
        order.activity.push({ by: req.user.name, text: `BOM built from ${s.sampleNo} · ${built.bom.lines.length} material lines${built.created.length ? ` · ${built.created.length} new stock item(s)` : ''}` });
        await order.save();
      }
    } catch (e) { log.warn(`BOM not built for ${order.orderNo}: ${e.message}`); }
  }
  audit.record(req, 'order.create', `Order:${order.orderNo}`, null, { from: s.sampleNo, qty });
  log.info(`${order.orderNo} created from ${s.sampleNo} · qty=${qty}`);
  return present(order, req.user);
};

/** Order Control Tower (FR-4.1) — every gate derived; later-phase gates say so honestly. */
const controlTower = async (order, user, position, pos) => {
  const sample = order.sampleId ? await Sample.findById(order.sampleId) : null;
  const JobWork = require('../jobwork/jobwork.model');
  const production = require('../production/production.service');
  const jws = await JobWork.find({ orderId: order._id, status: { $ne: 'Cancelled' } });
  const openJw = jws.filter((j) => JobWork.OPEN.includes(j.status));
  const overdueJw = openJw.filter((j) => j.dueDate && j.dueDate.getTime() < Date.now());
  const jwSent = openJw.reduce((a, j) => a + j.sentQty, 0), jwBack = openJw.reduce((a, j) => a + j.returnedQty, 0);
  const jobwork = !jws.length ? { s: 'Nothing outsourced', k: '' }
    : overdueJw.length ? { s: `${overdueJw.length} challan overdue`, k: 'bad' }
    : openJw.length ? { s: `${openJw.length} open · ${jwSent ? Math.round(jwBack * 100 / jwSent) : 0}% back`, k: 'warn' }
    : { s: `${jws.length} challan returned`, k: 'ok' };
  const prod = await production.orderSummary(order._id);
  const productionGate = prod.blocked.length ? { s: `Blocked — ${prod.blocked[0]}`, k: 'bad' }
    : !prod.ops || prod.done <= 0 ? { s: 'Not started', k: order.stage === 'Order Confirmed' ? '' : 'warn' }
    : prod.pct >= 100 ? { s: 'All operations completed', k: 'ok' } : { s: `${prod.pct}% done · ${(prod.planned - prod.done).toLocaleString('en-IN')} pending`, k: 'warn' };
  const p0 = position || await stock.orderPosition(order, user);
  const packShort = p0.rows.filter((r) => r.category === 'Packing' && r.shortage > 0);
  const packing = prod.packingDone ? { s: 'Packed', k: 'ok' }
    : packShort.length ? { s: `Blocked — ${packShort.length} packing line${packShort.length > 1 ? 's' : ''} short`, k: 'bad' }
    : prod.packingPct > 0 ? { s: `${prod.packingPct}% packed`, k: 'warn' } : { s: 'Queued · material OK', k: '' };
  const dispatches = await require('../dispatch/dispatch.service').forOrder(order._id, { role: 'Admin' });
  const payments = await require('../payments/payments.service').forOrder(order._id, { role: 'Admin' });
  const shipped = dispatches.find((d) => ['Shipped On Board', 'In Transit', 'Delivered'].includes(d.status));
  const dispatchGate = !dispatches.length ? { s: 'Not invoiced', k: '' }
    : dispatches.some((d) => d.status === 'Delivered') ? { s: `${dispatches.find((d) => d.status === 'Delivered').invoiceNo} · Delivered`, k: 'ok' }
    : shipped ? { s: `${shipped.invoiceNo} · ${shipped.status}`, k: 'ok' }
    : { s: `${dispatches[0].invoiceNo} · ${dispatches[0].docsPending.length} doc${dispatches[0].docsPending.length === 1 ? '' : 's'} pending`, k: 'warn' };
  const pay = payments[0];
  const paymentGate = !pay ? { s: 'No invoice yet', k: '' }
    : pay.status === 'Received' ? { s: `${pay.invoiceNo} · realised${pay.realisationDays != null ? ` in ${pay.realisationDays} d` : ''}`, k: 'ok' }
    : pay.overdue ? { s: `${pay.invoiceNo} · ${pay.status} · overdue`, k: 'bad' }
    : { s: `${pay.invoiceNo} · ${pay.status} (${pay.method})`, k: 'warn' };
  const qc = await require('../quality/quality.service').orderQc(order._id);
  const qcGate = qc.final ? (qc.final.result === 'Pass' ? { s: `Final ${qc.final.inspNo} · Pass`, k: 'ok' } : { s: `Final ${qc.final.inspNo} · ${qc.final.result} — dispatch blocked`, k: 'bad' })
    : qc.mid ? { s: `Mid ${qc.mid.inspNo} · ${qc.mid.result} · final pending`, k: qc.mid.result === 'Pass' ? 'warn' : 'bad' } : { s: 'Not inspected', k: '' };
  const p = position || await stock.orderPosition(order, user);
  const bomLines = p.rows.length, shortLines = p.shortages || 0;
  const reservedAll = bomLines && p.rows.every((r) => r.status === 'Reserved');
  const openPos = (pos || []).filter((x) => Po.OPEN.includes(x.status));
  const pendingPos = (pos || []).filter((x) => x.status === 'Pending Approval');
  const donePos = (pos || []).filter((x) => x.status === 'Fully Received');
  const procurement = !bomLines ? { s: 'Needs BOM', k: 'warn' }
    : pendingPos.length ? { s: `${pendingPos.length} PO awaiting approval`, k: 'warn' }
    : openPos.length ? { s: `${openPos.length} PO open · ${Math.round(openPos.reduce((a, x) => a + x.receivedQty, 0) * 100 / Math.max(openPos.reduce((a, x) => a + x.orderedQty, 0), 1))}% received`, k: 'warn' }
    : p.toOrderLines ? { s: `${p.toOrderLines} line${p.toOrderLines > 1 ? 's' : ''} need a PO`, k: 'bad' }
    : donePos.length ? { s: `${donePos.length} PO fully received`, k: 'ok' } : { s: 'Nothing to buy', k: 'ok' };
  const later = (phase) => ({ s: `Phase ${phase}`, k: 'pending' });
  return [
    { n: 1, t: 'Sample', s: sample ? `${sample.sampleNo} · ${sample.status}` : 'Not linked', k: sample && sample.status === 'Approved' ? 'ok' : 'warn' },
    { n: 2, t: 'Specification', s: order.specSheet && order.specSheet.fileName ? `${order.specSheet.fileName} · v${order.specSheet.version}` : 'Not attached', k: order.specSheet && order.specSheet.fileName ? 'ok' : 'warn' },
    { n: 3, t: 'Order', s: `Confirmed · ${order.qty.toLocaleString('en-IN')} pcs`, k: 'ok' },
    { n: 4, t: 'Material', s: !bomLines ? 'No BOM yet' : shortLines ? `${shortLines} of ${bomLines} lines short` : reservedAll ? 'All reserved' : 'All available', k: !bomLines ? 'warn' : shortLines ? 'bad' : 'ok' },
    { n: 5, t: 'Procurement', ...procurement },
    { n: 6, t: 'Job Work', ...jobwork },
    { n: 7, t: 'Production', ...productionGate },
    { n: 8, t: 'QC', ...qcGate },
    { n: 9, t: 'Packing', ...packing },
    { n: 10, t: 'Dispatch', ...dispatchGate },
    { n: 11, t: 'Payment', ...paymentGate },
    { n: 12, t: 'Closed', s: order.status === 'Closed' ? 'Order closed' : 'Open', k: order.status === 'Closed' ? 'ok' : '' },
  ];
};

/** Sample piece photos (or the style image) per order — `{ [orderId]: { photos, swatch, pieceColours } }`. Used by list thumbnails, the order header, the TNA board and the hover card. */
const photosOf = async (orders) => {
  const ids = [...new Set(orders.map((o) => o.sampleId && String(o.sampleId)).filter(Boolean))];
  const samples = ids.length ? await Sample.find({ _id: { $in: ids } }).select('items.fileId items.colour swatch colour') : [];
  const byId = Object.fromEntries(samples.map((s) => [String(s._id), s]));
  const styleIds = [...new Set(orders.map((o) => o.styleId && String(o.styleId)).filter(Boolean))];
  const styles = styleIds.length ? await Style.find({ _id: { $in: styleIds } }).select('imageFileId') : [];
  const styleImg = Object.fromEntries(styles.map((s) => [String(s._id), s.imageFileId]));
  const out = {};
  for (const o of orders) {
    const smp = byId[String(o.sampleId)];
    const photos = smp ? smp.items.map((it) => it.fileId).filter(Boolean).map(String) : [];
    if (!photos.length && o.styleId && styleImg[String(o.styleId)]) photos.push(String(styleImg[String(o.styleId)]));
    out[String(o._id || o.id)] = { photos, swatch: smp ? smp.swatch : '', pieceColours: smp ? [...new Set(smp.items.map((it) => it.colour).filter(Boolean))] : [] };
  }
  return out;
};
/** Photos + swatch + shipped totals for list thumbnails and the order header. */
const withMedia = async (orders) => {
  const media = await photosOf(orders);
  const shipped = await require('../dispatch/dispatch.service').shippedMap(orders.map((o) => o._id || o.id));
  return orders.map((o) => {
    const sh = shipped[String(o._id || o.id)] || { qty: 0, n: 0 };
    o.shippedQty = sh.qty; o.shipments = sh.n; o.balanceQty = Math.max((o.qty || 0) - sh.qty - (o.cancelledQty || 0), 0);
    const m = media[String(o._id || o.id)] || { photos: [], swatch: '', pieceColours: [] };
    return { ...o, photos: m.photos.slice(0, 4), photoCount: m.photos.length, swatch: m.swatch, pieceColours: m.pieceColours };
  });
};
/** Everything a floor / quality / job-work form needs the moment an order is picked: colours × sizes (planned, cut), BOM lines
 *  (fabric / trims of this style), operation done-so-far per colour, size-wise cut so far, fabric lots received at the gate. */
const formContext = async (req, id) => {
  const o = await Order.findById(id);
  if (!o) throw new ApiError(404, 'Order not found');
  const Bom = require('../bom/bom.model');
  const { ProductionOp, ProductionLog, CuttingReport } = require('../production/production.model');
  const Gate = require('../gate/gate.model');
  const Material = require('../materials/material.model');
  const bom = o.styleId ? await Bom.findOne({ styleId: o.styleId }) : null;
  const mats = bom ? await Material.find({ _id: { $in: bom.lines.map((l) => l.materialId) } }).select('code name category itemType uom physicalQty reservedQty supplierName') : [];
  const matById = Object.fromEntries(mats.map((m) => [String(m._id), m]));
  const bomLines = (bom ? bom.lines : []).map((l) => { const m = matById[String(l.materialId)]; return { materialId: String(l.materialId), code: m ? m.code : l.materialCode, name: m ? m.name : l.materialName, category: m ? m.category : '', itemType: m ? m.itemType : '', uom: l.uom || (m ? m.uom : ''), part: l.part || '', colour: l.colour || '', perPc: l.perPc, required: Bom.lineRequired(l, o), inStock: m ? m.physicalQty : 0, supplierName: m ? m.supplierName : '' }; });
  const ops = await ProductionOp.find({ orderId: o._id });
  const logs = await ProductionLog.find({ orderId: o._id }).select('op colour output rejected loaded');
  const opInfo = {};
  for (const op of ops) {
    const mine = logs.filter((l) => l.op === op.op);
    const byColour = {};
    mine.forEach((l) => { const k = l.colour || ''; byColour[k] = byColour[k] || { output: 0, rejected: 0, loaded: 0 }; byColour[k].output += l.output; byColour[k].rejected += l.rejected; byColour[k].loaded += l.loaded || 0; });
    opInfo[op.op] = { planned: op.plannedQty, done: op.doneQty, pending: Math.max(op.plannedQty - op.doneQty, 0), exec: op.exec, line: op.line, vendorAlias: op.vendorAlias, state: op.blocked ? 'Blocked' : op.doneQty >= op.plannedQty && op.plannedQty > 0 ? 'Completed' : op.doneQty > 0 ? 'In Process' : 'Pending', byColour };
  }
  const cuts = await CuttingReport.find({ orderId: o._id }).select('colour sizes');
  const cutBySize = {};
  cuts.forEach((c) => { const k = c.colour || ''; cutBySize[k] = cutBySize[k] || {}; Object.entries(c.sizes || {}).forEach(([s, n]) => { cutBySize[k][s] = (cutBySize[k][s] || 0) + (+n || 0); }); });
  const bomMatIds = bomLines.map((l) => l.materialId);
  const grns = await Gate.find({ kind: 'po', $or: [{ orderId: o._id }, { materialId: { $in: bomMatIds } }] }).sort('-date').limit(40).select('grnNo materialId materialCode materialName lots receivedQty date partyName');
  const fabricLots = [];
  grns.forEach((g) => { if (g.lots && g.lots.length) g.lots.forEach((l) => fabricLots.push({ grnNo: g.grnNo, materialId: String(g.materialId), materialCode: g.materialCode, lotNo: l.lotNo, colour: l.colour, thans: l.thans, actualLength: l.actualLength, actualWidth: l.actualWidth, gsm: l.gsm, date: g.date })); else fabricLots.push({ grnNo: g.grnNo, materialId: String(g.materialId), materialCode: g.materialCode, lotNo: '', colour: '', thans: 0, actualLength: g.receivedQty, actualWidth: 0, gsm: 0, date: g.date }); });
  const sample = o.sampleId ? await Sample.findById(o.sampleId).select('sampleNo fabric colour gsm items') : null;
  const sizeSet = (o.sizeSet && o.sizeSet.length) ? o.sizeSet : (o.sizes || []).map((s) => s.size);
  return {
    order: { id: String(o._id), orderNo: o.orderNo, styleNo: o.styleNo, styleId: o.styleId ? String(o.styleId) : '', description: o.description, qty: o.qty, cutQty: o.cutQty, sizeSet, priority: o.priority, shipDate: o.shipDate,
      colours: (o.colours || []).map((c) => ({ code: c.code, name: c.name || c.code, qty: c.qty, cutQty: c.cutQty, sizes: (c.sizes || []).map((s) => ({ size: s.size, qty: s.qty, cutQty: s.cutQty })) })),
      sizes: (o.sizes || []).map((s) => ({ size: s.size, qty: s.qty })) },
    sample: sample ? { sampleNo: sample.sampleNo, fabric: sample.fabric, colour: sample.colour, gsm: sample.gsm, pieces: (sample.items || []).map((it) => ({ fabric: it.fabric, colour: it.colour })) } : null,
    bom: bomLines, ops: opInfo, cutBySize, fabricLots,
  };
};
/** Small card for hover previews on every page that names an order: photo, style, buyer, qty, stage, ship date. */
const card = async (req, id) => {
  const o = present(await Order.findById(id), req.user);
  if (!o) throw new ApiError(404, 'Order not found');
  const m = (await photosOf([o]))[String(o.id)] || { photos: [], swatch: '' };
  return { id: o.id, orderNo: o.orderNo, styleNo: o.styleNo, buyerName: o.buyerName, description: o.description, qty: o.qty, shipDate: o.shipDate, stage: o.stage, status: o.status, priority: o.priority, progress: o.progress, sampleNo: o.sampleNo, photos: m.photos.slice(0, 3), swatch: m.swatch };
};
/** Quantities changed by a revision -> production planned qty follows (after the order is saved, never mid-update). */
const update = async (req, id, body) => {
  const r = await base.update(req, id, body || {});
  if (body && (body.qty !== undefined || body.colours !== undefined || body.cutQty !== undefined)) await require('../production/production.service').syncPlanned(await Order.findById(id));
  return r;
};
const list = async (req) => { const r = await base.list(req); return { ...r, items: await withMedia(r.items) }; };
const get = async (req, id) => (await withMedia([await base.get(req, id)]))[0];

const detail = async (req, id) => {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  const [position, pos, movements] = await Promise.all([
    stock.orderPosition(order, req.user),
    Po.find({ orderId: order._id }).sort('-poDate'),
    stock.ledgerFor({ orderId: order._id, limit: 100 }),
  ]);
  const poSvc = require('../po/po.service');
  const jwSvc = require('../jobwork/jobwork.service');
  const production = require('../production/production.service');
  const jws = await require('../jobwork/jobwork.model').find({ orderId: order._id }).sort('-outDate');
  return {
    order: (await withMedia([present(order, req.user)]))[0],
    tower: await controlTower(order, req.user, position, pos),
    material: position,
    pos: pos.map((p) => poSvc.present(p, req.user)),
    movements: movements.map(plain),
    jobworks: jws.map((j) => jwSvc.present(j, req.user)),
    ops: order.status === 'Open' ? await production.orderOps(order, req.user) : [],
    dispatches: await require('../dispatch/dispatch.service').forOrder(order._id, req.user),
    payments: await require('../payments/payments.service').forOrder(order._id, req.user),
    shipping: await require('../dispatch/dispatch.service').shippingTrack([order], req.user).then((r) => r[0]),
    buyerOrder: order.buyerOrderId ? await require('./buyer-order.model').findById(order.buyerOrderId).then((b) => (b ? require('./buyer-orders.service').present(b, req.user) : null)) : null,
  };
};

/** Fabric WIP per BOM fabric line: required → PO'd → received lot-wise (thans, on-tag vs actual) → rejected / on hold → balance. */
const fabricWip = async (req, id) => {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  const Bom = require('../bom/bom.model');
  const Material = require('../materials/material.model');
  const Gate = require('../gate/gate.model');
  const { FabricInspection } = require('../quality/quality.model');
  const bom = order.styleId ? await Bom.findOne({ styleId: order.styleId }) : null;
  if (!bom) return { hasBom: false, rows: [] };
  const mats = await Material.find({ _id: { $in: bom.lines.map((l) => l.materialId) }, category: 'Fabric' });
  const lines = bom.lines.filter((l) => mats.some((m) => String(m._id) === String(l.materialId)));
  const ids = lines.map((l) => l.materialId);
  const [pos, grns, insps] = await Promise.all([
    Po.find({ orderId: order._id, materialId: { $in: ids } }), Gate.find({ orderId: order._id, materialId: { $in: ids }, kind: 'po' }).sort('date'), FabricInspection.find({ materialId: { $in: ids } }).sort('-date'),
  ]);
  const rows = lines.map((l) => {
    const m = mats.find((x) => String(x._id) === String(l.materialId));
    const required = Bom.lineRequired(l, order.toObject());
    const myPos = pos.filter((p) => String(p.materialId) === String(l.materialId) && p.status !== 'Cancelled');
    const myGrns = grns.filter((g) => String(g.materialId) === String(l.materialId));
    const lots = myGrns.flatMap((g) => (g.lots.length ? g.lots.map((x) => ({ ...x.toObject(), grnNo: g.grnNo, date: g.date, supplier: g.partyName })) : [{ lotNo: g.grnNo, colour: '', thans: 0, actualLength: g.receivedQty, tagLength: 0, grnNo: g.grnNo, date: g.date, supplier: g.partyName }]));
    const holds = insps.filter((i) => String(i.materialId) === String(l.materialId) && (i.hold || i.result === 'Fail')).map((i) => ({ inspNo: i.inspNo, lot: i.lot, qty: i.holdQty, result: i.result, hold: i.hold, date: i.date }));
    const received = myGrns.reduce((a, g) => a + g.receivedQty, 0), rejected = myGrns.reduce((a, g) => a + (g.rejectedQty || 0), 0) + holds.filter((h) => h.hold).reduce((a, h) => a + h.qty, 0);
    return { materialId: l.materialId, code: l.materialCode, name: l.materialName, uom: l.uom, part: l.part || '', colour: l.colour || '', required,
      ordered: myPos.reduce((a, p) => a + p.orderedQty, 0), pos: myPos.map((p) => ({ poNo: p.poNo, qty: p.orderedQty, received: p.receivedQty, eta: p.eta, status: p.status, supplier: p.supplierName })),
      received, rejected, usable: Math.max(received - rejected, 0), balance: Math.max(required - Math.max(received - rejected, 0), 0), lots, holds,
      stock: m ? { physical: m.physicalQty, reserved: m.reservedQty } : null };
  });
  return { hasBom: true, rows, orderNo: order.orderNo, colours: order.colours };
};

/** Shipping track — every open/closed order line with ship-1…n, shipped, short/cancelled and balance (client 'Shipping Track' sheet). */
const shippingTrack = async (req, q = {}) => {
  const f = {};
  if (q.buyerId) f.buyerId = q.buyerId;
  if (q.status) f.status = q.status;
  if (q.buyerOrderId) f.buyerOrderId = q.buyerOrderId;
  const orders = await Order.find(f).sort('shipDate');
  const rows = await require('../dispatch/dispatch.service').shippingTrack(orders, req.user);
  return { items: rows.map((r, i) => ({ ...r, order: present(orders[i], req.user) })), total: rows.length };
};

/** Reserve free stock against the BOM (Order Stock) / release it again. */
const reserve = async (req, id) => {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  const out = await stock.reserveForOrder(req, order);
  if (out.reserved.length) { order.activity.push({ by: req.user.name, text: `Material reserved: ${out.reserved.join(', ')}` }); await order.save(); }
  return out;
};
const release = async (req, id) => {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  const out = await stock.releaseForOrder(req, order);
  if (out.released) { order.activity.push({ by: req.user.name, text: `Material reservation released (${out.released} lines)` }); await order.save(); }
  return out;
};

const addActivity = async (req, id, text) => {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  if (!text) throw ApiError.badRequest('Note is required');
  order.activity.push({ by: req.user.name, text });
  await order.save();
  return present(order, req.user);
};

const close = async (req, id) => {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  order.status = order.status === 'Closed' ? 'Open' : 'Closed';
  order.stage = order.status === 'Closed' ? 'Closed' : 'Order Confirmed';
  order.activity.push({ by: req.user.name, text: order.status === 'Closed' ? 'Order closed' : 'Order re-opened' });
  await order.save();
  audit.record(req, 'order.close', `Order:${order.orderNo}`, null, { status: order.status });
  return present(order, req.user);
};

module.exports = { ...base, list, get, update, present, createFromSample, detail, card, photosOf, formContext, card, photosOf, card, photosOf, addActivity, close, reserve, release, shippingTrack, fabricWip, normColours, cleanSizeSet, SIZES, CURRENCIES };
