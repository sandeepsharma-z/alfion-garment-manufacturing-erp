const ApiError = require('../../common/utils/api-error');
const { cleanCustom } = require('../../common/utils/custom-fields');
const { plain, buyerLabel } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Dispatch = require('./dispatch.model');
const Order = require('../orders/order.model');
const Buyer = require('../buyers/buyer.model');
const File = require('../files/file.model');
const { AqlInspection } = require('../quality/quality.model');
const { ProductionOp } = require('../production/production.model');
const { amountInWords } = require('../../common/utils/words');
const log = logger.child({ context: 'DispatchService' });

const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Status derived from tracking + documents (never stored). */
const statusOf = (d) => {
  const t = (k) => (d.tracking || []).find((x) => x.key === k && x.done);
  if (t('delivered')) return 'Delivered';
  if (t('transit')) return 'In Transit';
  if (t('onboard')) return 'Shipped On Board';
  const docs = d.documents || [];
  return docs.length && docs.every((x) => x.status !== 'Pending') ? 'Ready to Ship' : 'Docs In Progress';
};

const present = (doc, user) => {
  const d = plain(doc);
  d.buyerName = buyerLabel(user, d.buyerBrand, d.buyerAlias);
  if (!hasFlag(user, 'buyer.confidential')) delete d.buyerBrand;
  if (!hasFlag(user, 'rates.view')) { delete d.invoiceValue; delete d.totalFx; delete d.taxableInr; delete d.igstInr; delete d.totalInr; delete d.amountInWords; delete d.amountInWordsFx; delete d.fxRate;
    d.lines = (d.lines || []).map((l) => { const { unitPrice, amountFx, amountInr, ...rest } = l; return rest; }); }
  d.lineCount = (d.lines || []).length;
  d.status = statusOf(d);
  d.docsPending = (d.documents || []).filter((x) => x.status === 'Pending').map((x) => x.type);
  d.docsDone = (d.documents || []).length - d.docsPending.length;
  d.route = `${d.portOfLoading || '—'} → ${d.portOfDischarge || '—'}`;
  d.onTime = t(d, 'onboard') && doc.orderShipDate ? undefined : undefined;
  return d;
};
const t = (d, k) => (d.tracking || []).find((x) => x.key === k && x.done);

/** FR-20.3: a failed / held Final AQL blocks dispatch. */
const assertShippable = async (order) => {
  const finalAql = await AqlInspection.findOne({ orderId: order._id, stage: 'Final' }).sort('-date -createdAt');
  if (finalAql && finalAql.result !== 'Pass') throw ApiError.badRequest(`${order.orderNo}: final inspection ${finalAql.inspNo} is ${finalAql.result} — dispatch is blocked until a passed final inspection is recorded`);
  return finalAql;
};

const money = (n) => Math.round((+n || 0) * 100) / 100;
/** Σ shipped per order from invoice lines → { orderId: { qty, n } } */
const shippedMap = async (orderIds) => {
  const ids = (orderIds || []).map((x) => new (require('mongoose').Types.ObjectId)(String(x)));
  if (!ids.length) return {};
  const rows = await Dispatch.aggregate([{ $match: { 'lines.orderId': { $in: ids } } }, { $unwind: '$lines' }, { $match: { 'lines.orderId': { $in: ids } } },
    { $group: { _id: '$lines.orderId', qty: { $sum: '$lines.qty' }, n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), { qty: r.qty, n: r.n }]));
};

/** Per order: ship-1…n (invoice, date, qty, AWB / B-L, status), shipped, cancelled, balance — the client's Shipping Track. */
const shippingTrack = async (orders, user) => {
  const ids = orders.map((o) => o._id);
  const ds = ids.length ? await Dispatch.find({ 'lines.orderId': { $in: ids } }).sort('invoiceDate createdAt') : [];
  const canRate = hasFlag(user, 'rates.view');
  return orders.map((o) => {
    const shipments = [];
    ds.forEach((d) => d.lines.filter((l) => String(l.orderId) === String(o._id)).forEach((l) => shipments.push({ no: shipments.length + 1, dispatchId: d._id, invoiceNo: d.invoiceNo, invoiceDate: d.invoiceDate, qty: l.qty,
      awb: d.blOrAwbNo, mode: d.mode, status: statusOf(d), shippedAt: (d.tracking.find((t) => t.key === 'onboard' && t.done) || {}).at, cartons: d.cartons })));
    const shippedQty = shipments.reduce((a, s) => a + s.qty, 0);
    const balanceQty = Math.max(o.qty - shippedQty - (o.cancelledQty || 0), 0);
    const last = shipments.map((s) => s.shippedAt).filter(Boolean).sort().pop();
    return { orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, buyerOrderNo: o.buyerOrderNo, buyerPoNo: o.buyerPoNo, qty: o.qty, shipments, shippedQty, cancelledQty: o.cancelledQty || 0, balanceQty,
      shortQty: o.status === 'Closed' ? balanceQty : 0, shipDate: o.shipDate, targetShipDate: o.targetShipDate, lastShippedAt: last || null,
      onTime: last && o.shipDate ? new Date(last) <= new Date(o.shipDate) : null,
      balanceValueFx: canRate ? money(balanceQty * (o.unitPrice || 0)) : undefined, currency: o.currency };
  });
};

const create = async (req, b) => {
  const rawLines = (Array.isArray(b.lines) && b.lines.length ? b.lines : [{ orderId: b.orderId, qty: b.qty, unitPrice: b.unitPrice, hsCode: b.hsnCode }]).filter((l) => l && l.orderId);
  if (!rawLines.length) throw ApiError.badRequest('Order is required');
  const orders = await Order.find({ _id: { $in: rawLines.map((l) => l.orderId) } });
  const byId = Object.fromEntries(orders.map((o) => [String(o._id), o]));
  const order = byId[String(rawLines[0].orderId)];
  if (!order) throw ApiError.badRequest('Order is required');
  for (const l of rawLines) {
    const o = byId[String(l.orderId)];
    if (!o) throw ApiError.badRequest('Unknown order on an invoice line');
    if (o.status !== 'Open') throw ApiError.badRequest(`${o.orderNo} is closed`);
    if (String(o.buyerId) !== String(order.buyerId)) throw ApiError.badRequest(`${o.orderNo} belongs to another buyer — one invoice per buyer`);
    await assertShippable(o);
  }
  const cfg = await settings();
  const canRate = hasFlag(req.user, 'rates.view');
  const shipped = await shippedMap(orders.map((o) => o._id));
  const currency = order.currency || cfg.defaultCurrency || 'USD';
  if (orders.some((o) => (o.currency || 'INR') !== currency)) throw ApiError.badRequest('All lines on one invoice must be in the same currency');
  const fx = currency === 'INR' ? 1 : (+b.fxRate || order.fxRate || cfg.fxRate || 1);
  const buyer = order.buyerId ? await Buyer.findById(order.buyerId) : null;
  const sh = (buyer && buyer.shipping) || {};                  // the buyer's standing shipping / document details
  const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '' && v !== 0);
  const lines = rawLines.map((l) => {
    const o = byId[String(l.orderId)];
    const balance = Math.max(o.qty - ((shipped[String(o._id)] || { qty: 0 }).qty) - (o.cancelledQty || 0), 0);
    const qty = Math.max(Math.round(+l.qty || 0), 0) || balance || o.qty;
    const unitPrice = canRate && l.unitPrice !== undefined && l.unitPrice !== '' ? money(l.unitPrice) : (o.unitPrice || (o.fobRate || 0) / fx);
    const amountFx = money(qty * unitPrice);
    return { orderId: o._id, orderNo: o.orderNo, buyerPoNo: o.buyerPoNo, styleNo: o.styleNo, description: l.description || o.description, colour: l.colour || o.colour || '', hsCode: l.hsCode || b.hsnCode || sh.hsCode || '6205',
      qty, unitPrice: money(unitPrice), currency, amountFx, amountInr: Math.round(amountFx * fx) };
  });
  const totalFx = money(lines.reduce((a, l) => a + l.amountFx, 0));
  const taxableInr = canRate && b.invoiceValue !== undefined && b.invoiceValue !== '' && rawLines.length === 1 ? Math.round(+b.invoiceValue) : lines.reduce((a, l) => a + l.amountInr, 0);
  const igstPct = b.igstPct !== undefined && b.igstPct !== '' ? Math.max(+b.igstPct || 0, 0) : (cfg.igstPct || 0);
  const igstInr = Math.round(taxableInr * igstPct / 100);
  const totalInr = taxableInr + igstInr;
  const fy = cfg.financialYear || '2026-27';
  const packing = await ProductionOp.findOne({ orderId: order._id, op: 'Packing' });
  const wanted = Array.isArray(b.documents) && b.documents.length ? b.documents : ['Commercial Invoice', 'Packing List', 'E-Way Bill', 'Delivery Challan'];
  const mode = (b.mode || sh.mode) === 'Air' ? 'Air' : 'Sea';
  const docs = [...new Set([...wanted, mode === 'Air' ? 'Airway Bill' : 'Bill of Lading'])].filter((x) => Dispatch.DOC_TYPES.includes(x)).map((type) => ({ type, status: 'Pending' }));
  const d = await Dispatch.create({
    lines, buyerOrderNo: order.buyerOrderNo || '', fxRate: fx, totalFx, taxableInr, igstPct, igstInr, totalInr, amountInWords: amountInWords(totalInr, 'INR'), amountInWordsFx: amountInWords(totalFx, currency),
    consignee: { name: pick(b.consignee && b.consignee.name, sh.consigneeName, buyer && (buyer.legalName || buyer.brand)) || '',
      address: pick(b.consignee && b.consignee.address, sh.consigneeAddress, buyer && buyer.address) || '',
      country: pick(b.consignee && b.consignee.country, sh.consigneeCountry, buyer && buyer.country) || '' },
    notifyParty: pick(b.notifyParty, sh.notifyParty) || '', preCarriage: pick(b.preCarriage, sh.preCarriage, 'By road'),
    placeOfReceipt: pick(b.placeOfReceipt, sh.placeOfReceipt, 'Gurgaon'), finalDestination: pick(b.finalDestination, sh.finalDestination, buyer && buyer.country) || '',
    advanceFx: money(b.advanceFx), proformaNo: b.proformaNo || '', cartonDims: pick(b.cartonDims, sh.cartonDims) || '', marksAndNos: pick(b.marksAndNos, sh.marksAndNos) || '',
    lcNo: b.lcNo || '', lcDate: b.lcDate ? new Date(b.lcDate) : undefined, reverseCharge: !!b.reverseCharge,
    custom: await cleanCustom('dispatch', b.custom),
    invoiceNo: `${cfg.invoicePrefix || 'AFI/EXP'}/${fy}/${pad(await nextSeq('invoice', 182), 4)}`,
    orderId: order._id, orderNo: order.orderNo, buyerId: order.buyerId, buyerBrand: order.buyerBrand, buyerAlias: order.buyerAlias, buyerPoNo: order.buyerPoNo,
    styleNo: order.styleNo, description: order.description, invoiceDate: b.invoiceDate ? new Date(b.invoiceDate) : new Date(), mode,
    portOfLoading: pick(b.portOfLoading, sh.portOfLoading, cfg.defaultPort) || '', portOfDischarge: pick(b.portOfDischarge, sh.portOfDischarge, cfg.defaultPortOfDischarge, buyer && buyer.country) || '',
    incoterm: pick(b.incoterm, sh.incoterm, 'FOB'),
    qty: lines.reduce((a, l) => a + l.qty, 0),
    cartons: +b.cartons || (pick(order.pcsPerCarton, sh.pcsPerCarton) ? Math.ceil(lines.reduce((a, l) => a + l.qty, 0) / pick(order.pcsPerCarton, sh.pcsPerCarton)) : 0),
    grossWeightKg: +b.grossWeightKg || 0, netWeightKg: +b.netWeightKg || 0,
    currency, invoiceValue: totalInr, hsnCode: lines[0].hsCode,
    paymentMethod: pick(b.paymentMethod, sh.paymentMethod, /(LC|Letter of Credit)/i.test(order.paymentTerms) ? 'LC' : 'T/T'),
    paymentTerms: b.paymentTerms || order.paymentTerms || '', documents: docs, tracking: Dispatch.TRACK.map((x) => ({ ...x, done: false })),
    transporter: b.transporter || '', remarks: b.remarks || '', createdBy: req.user.uid,
  });
  /* the invoice opens a payment tracker (M-15) */
  await require('../payments/payments.service').openForDispatch(req, d, order);
  if (!packing || packing.doneQty < packing.plannedQty) log.warn(`${d.invoiceNo} raised while packing is ${packing ? packing.doneQty + '/' + packing.plannedQty : 'not planned'}`);
  for (const l of lines) await Order.updateOne({ _id: l.orderId }, { $push: { activity: { by: req.user.name, text: `Export invoice ${d.invoiceNo} created · ${l.qty} pcs · ${mode} · ${d.cartons} cartons · ${docs.length} documents to prepare` } } });
  audit.record(req, 'dispatch.create', `Dispatch:${d.invoiceNo}`, null, { order: order.orderNo, mode, cartons: d.cartons });
  log.info(`${d.invoiceNo} · ${order.orderNo} · ${mode} · ${d.cartons} ctn`);
  return present(d, req.user);
};

const update = async (req, id, b) => {
  const d = await Dispatch.findById(id);
  if (!d) throw ApiError.notFound('Shipment not found');
  const before = d.toObject();
  ['portOfLoading', 'portOfDischarge', 'incoterm', 'vesselOrFlight', 'blOrAwbNo', 'containerNo', 'sealNo', 'shippingBillNo', 'ewayBillNo', 'transporter', 'remarks', 'hsnCode', 'preCarriage', 'placeOfReceipt', 'finalDestination', 'notifyParty', 'lcNo', 'buyerOrderNo', 'proformaNo', 'cartonDims', 'marksAndNos']
    .forEach((k) => { if (b[k] !== undefined) d.set(k, b[k]); });
  ['cartons', 'grossWeightKg', 'netWeightKg', 'qty'].forEach((k) => { if (b[k] !== undefined) d.set(k, +b[k] || 0); });
  if (b.advanceFx !== undefined && hasFlag(req.user, 'rates.view')) d.advanceFx = money(b.advanceFx);   // "Less - Advance" on the invoice
  if (b.eta !== undefined) d.eta = b.eta ? new Date(b.eta) : undefined;
  if (b.lcDate !== undefined) d.lcDate = b.lcDate ? new Date(b.lcDate) : undefined;
  if (b.reverseCharge !== undefined) d.reverseCharge = !!b.reverseCharge;
  if (b.consignee && typeof b.consignee === 'object') d.consignee = { name: String(b.consignee.name || ''), address: String(b.consignee.address || ''), country: String(b.consignee.country || '') };
  if (b.igstPct !== undefined && hasFlag(req.user, 'rates.view')) { d.igstPct = Math.max(+b.igstPct || 0, 0); d.igstInr = Math.round(d.taxableInr * d.igstPct / 100); d.totalInr = d.taxableInr + d.igstInr; d.invoiceValue = d.totalInr; d.amountInWords = amountInWords(d.totalInr, 'INR'); }
  if (b.invoiceValue !== undefined && hasFlag(req.user, 'rates.view')) d.invoiceValue = Math.round(+b.invoiceValue || 0);
  if (b.custom !== undefined) { d.custom = await cleanCustom('dispatch', b.custom, d.custom || {}); d.markModified('custom'); }
  await d.save();
  audit.record(req, 'dispatch.update', `Dispatch:${d.invoiceNo}`, before, d.toObject());
  return present(d, req.user);
};

/** Document actions: generate (server data → printed by the app), upload (bank / port copies), number (EWB / BL / AWB / COO no) */
const docAction = async (req, id, type, action, b = {}) => {
  const d = await Dispatch.findById(id);
  if (!d) throw ApiError.notFound('Shipment not found');
  let doc = d.documents.find((x) => x.type === type);
  if (!doc) { if (!Dispatch.DOC_TYPES.includes(type)) throw ApiError.badRequest('Unknown document type'); d.documents.push({ type, status: 'Pending' }); doc = d.documents[d.documents.length - 1]; }
  if (action === 'generate') {
    if (!Dispatch.GENERATED.includes(type)) throw ApiError.badRequest(`${type} is issued by the carrier / authority — upload the copy instead`);
    doc.status = 'Generated'; doc.at = new Date(); doc.by = req.user.name;
  } else if (action === 'upload') {
    const f = await File.findById(b.fileId);
    if (!f) throw ApiError.badRequest('Upload the file first');
    doc.status = 'Uploaded'; doc.fileId = f._id; doc.fileName = f.name; doc.at = new Date(); doc.by = req.user.name;
  } else if (action === 'number') {
    doc.number = String(b.number || '').trim();
    if (type === 'E-Way Bill') d.ewayBillNo = doc.number;
    if (type === 'Bill of Lading' || type === 'Airway Bill') d.blOrAwbNo = doc.number;
    if (doc.number && doc.status === 'Pending') { doc.status = 'Generated'; doc.at = new Date(); doc.by = req.user.name; }
  } else throw ApiError.badRequest('Unknown document action');
  await d.save();
  audit.record(req, `dispatch.doc.${action}`, `Dispatch:${d.invoiceNo}`, null, { type, number: doc.number, file: doc.fileName });
  return present(d, req.user);
};

/** Tracking event → derived status; ex-factory / dispatch feed the TNA and the order stage. */
const track = async (req, id, b) => {
  const d = await Dispatch.findById(id);
  if (!d) throw ApiError.notFound('Shipment not found');
  const ev = d.tracking.find((x) => x.key === b.key);
  if (!ev) throw ApiError.badRequest('Unknown tracking event');
  if (b.key === 'onboard' && d.documents.some((x) => ['Commercial Invoice', 'Packing List'].includes(x.type) && x.status === 'Pending')) {
    throw ApiError.badRequest('Commercial invoice and packing list must be ready before the goods can ship');
  }
  ev.done = b.done !== false; ev.at = b.at ? new Date(b.at) : new Date(); ev.detail = b.detail || ev.detail || '';
  if (b.key === 'onboard' && b.blOrAwbNo) d.blOrAwbNo = b.blOrAwbNo;
  if (b.key === 'onboard' && b.vesselOrFlight) d.vesselOrFlight = b.vesselOrFlight;
  if (b.key === 'stuffing' && b.sealNo) d.sealNo = b.sealNo;
  if (b.key === 'customs' && b.shippingBillNo) d.shippingBillNo = b.shippingBillNo;
  if (b.eta) d.eta = new Date(b.eta);
  await d.save();
  const tna = require('../tna/tna.service');
  if (ev.done && b.key === 'stuffing') await tna.markEvent(d.orderId, 'ex_factory', ev.at, d.invoiceNo);
  const orderIds = [...new Set([String(d.orderId), ...d.lines.map((l) => String(l.orderId))])];
  for (const oid of orderIds) {
    if (ev.done && b.key === 'stuffing') await tna.markEvent(oid, 'ex_factory', ev.at, d.invoiceNo);
    if (ev.done && b.key === 'onboard') {
      await tna.markEvent(oid, 'ex_factory', ev.at, d.invoiceNo);
      await tna.markEvent(oid, 'dispatch', ev.at, d.invoiceNo);
      await Order.updateOne({ _id: oid, stage: { $nin: ['Payment', 'Closed'] } }, { $set: { stage: 'Dispatch', progress: 100 } });
    }
    await Order.updateOne({ _id: oid }, { $push: { activity: { by: req.user.name, text: `${d.invoiceNo}: ${ev.title}${ev.detail ? ' · ' + ev.detail : ''}` } } });
  }
  audit.record(req, 'dispatch.track', `Dispatch:${d.invoiceNo}`, null, { key: b.key, at: ev.at, detail: ev.detail });
  return present(d, req.user);
};

/** Everything a printable document needs (frontend renders + prints, like the spec sheet / challan). */
const docData = async (req, id, type) => {
  const d = await Dispatch.findById(id);
  if (!d) throw ApiError.notFound('Shipment not found');
  if (!hasFlag(req.user, 'rates.view') && ['Commercial Invoice', 'E-Way Bill'].includes(type)) throw ApiError.forbidden('Invoice values are restricted');
  const order = await Order.findById(d.orderId);
  const buyer = d.buyerId ? await Buyer.findById(d.buyerId) : null;
  const full = hasFlag(req.user, 'buyer.confidential');
  const lineOrders = await Order.find({ _id: { $in: d.lines.map((l) => l.orderId) } });
  const cfg = await settings();
  const orderView = (o) => ({ id: o._id, orderNo: o.orderNo, styleNo: o.styleNo, description: o.description, qty: o.qty, sizes: o.sizes, sizeSet: o.sizeSet, colours: o.colours, colour: o.colour, fabric: o.fabric, packRatio: o.packRatio, pcsPerCarton: o.pcsPerCarton, buyerPoNo: o.buyerPoNo, buyerOrderNo: o.buyerOrderNo, shipDate: o.shipDate });
  return {
    type, dispatch: present(d, req.user), orders: lineOrders.map(orderView), formatNo: (cfg.formatNos || {})[type === 'Packing List' || type === 'Carton Marks' ? 'packingList' : 'invoice'] || '',
    buyer: buyer ? (full ? { name: buyer.brand, legalName: buyer.legalName, address: buyer.address, country: buyer.country, contact: (buyer.contacts || [])[0], shipping: buyer.shipping || {} } : { name: `${buyer.alias} · ${buyer.country}`, country: buyer.country }) : null,
    order: order ? { orderNo: order.orderNo, styleNo: order.styleNo, description: order.description, qty: order.qty, sizes: order.sizes, colour: order.colour, fabric: order.fabric, packRatio: order.packRatio, pcsPerCarton: order.pcsPerCarton, buyerPoNo: order.buyerPoNo } : null,
    company: cfg,
  };
};

/** Box-wise packing: replace the matrix (PUT) or build it from the orders' colour × size grid and pcs / carton (auto). */
const cleanBoxes = (raw) => (Array.isArray(raw) ? raw : []).filter((x) => x && typeof x === 'object').map((x) => {
  const sizes = {}; Object.entries(x.sizes && typeof x.sizes === 'object' ? x.sizes : {}).forEach(([k, v]) => { const n = Math.max(Math.round(+v || 0), 0); if (n) sizes[String(k).trim()] = n; });
  const pcs = Object.values(sizes).reduce((a, n) => a + n, 0) || Math.max(Math.round(+x.pcs || 0), 0);
  return { from: Math.max(parseInt(x.from, 10) || 0, 0), to: Math.max(parseInt(x.to, 10) || parseInt(x.from, 10) || 0, 0), orderId: x.orderId || undefined, styleNo: String(x.styleNo || ''), colourCode: String(x.colourCode || ''), colour: String(x.colour || ''),
    sizes, pcs, grossKg: +x.grossKg || 0, netKg: +x.netKg || 0, dims: String(x.dims || '') };
}).filter((x) => x.from > 0 && x.pcs > 0);
const boxTotals = (d) => {
  const n = (b) => Math.max(b.to - b.from + 1, 1);
  d.cartons = d.boxes.reduce((a, b) => a + n(b), 0);
  d.grossWeightKg = Math.round(d.boxes.reduce((a, b) => a + b.grossKg * n(b), 0) * 100) / 100 || d.grossWeightKg;
  d.netWeightKg = Math.round(d.boxes.reduce((a, b) => a + b.netKg * n(b), 0) * 100) / 100 || d.netWeightKg;
};
const setBoxes = async (req, id, b) => {
  const d = await Dispatch.findById(id);
  if (!d) throw ApiError.notFound('Shipment not found');
  d.boxes = cleanBoxes(b.boxes); boxTotals(d);
  await d.save();
  audit.record(req, 'dispatch.boxes', `Dispatch:${d.invoiceNo}`, null, { boxes: d.boxes.length, cartons: d.cartons });
  return present(d, req.user);
};
const autoBoxes = async (req, id, b = {}) => {
  const d = await Dispatch.findById(id);
  if (!d) throw ApiError.notFound('Shipment not found');
  const orders = await Order.find({ _id: { $in: d.lines.map((l) => l.orderId) } });
  const buyer = d.buyerId ? await Buyer.findById(d.buyerId) : null;
  const sh = (buyer && buyer.shipping) || {};
  b = { pcsPerCarton: b.pcsPerCarton || sh.pcsPerCarton || undefined, grossKg: b.grossKg || sh.grossPerCartonKg || 0, netKg: b.netKg || sh.netPerCartonKg || 0, dims: b.dims || sh.cartonDims || '' };
  const boxes = []; let next = 1;
  const push = (o, colourCode, colour, size, qty, per) => {
    const full = Math.floor(qty / per), rem = qty % per;
    if (full) { boxes.push({ from: next, to: next + full - 1, orderId: o._id, styleNo: o.styleNo, colourCode, colour, sizes: { [size]: per }, pcs: per, grossKg: +b.grossKg || 0, netKg: +b.netKg || 0, dims: b.dims || '' }); next += full; }
    if (rem) { boxes.push({ from: next, to: next, orderId: o._id, styleNo: o.styleNo, colourCode, colour, sizes: { [size]: rem }, pcs: rem, grossKg: +b.grossKg || 0, netKg: +b.netKg || 0, dims: b.dims || '' }); next += 1; }
  };
  for (const l of d.lines) {
    const o = orders.find((x) => String(x._id) === String(l.orderId)); if (!o) continue;
    const per = Math.max(parseInt(b.pcsPerCarton, 10) || o.pcsPerCarton || 0, 0);
    if (!per) throw ApiError.badRequest(`${o.orderNo}: set pcs per carton on the packing plan first`);
    const ratio = l.qty / (o.qty || 1);   // partial shipment → scale the colour/size grid
    const cols = o.colours.length ? o.colours : [{ code: '', name: o.colour, sizes: o.sizes.map((s) => ({ size: s.size, qty: s.qty })) }];
    cols.forEach((c) => (c.sizes.length ? c.sizes : [{ size: 'F', qty: c.qty }]).forEach((s) => { const q = Math.round(s.qty * ratio); if (q > 0) push(o, c.code, c.name, s.size, q, per); }));
  }
  d.boxes = boxes; boxTotals(d);
  if (!d.cartonDims && b.dims) d.cartonDims = b.dims;
  await d.save();
  audit.record(req, 'dispatch.boxes.auto', `Dispatch:${d.invoiceNo}`, null, { boxes: boxes.length, cartons: d.cartons });
  return present(d, req.user);
};

const list = async (req, q = {}) => {
  const f = {};
  if (q.orderId) f.orderId = q.orderId;
  if (q.mode) f.mode = q.mode;
  const rows = await Dispatch.find(f).sort('-invoiceDate -createdAt').limit(500);
  let items = rows.map((r) => present(r, req.user));
  if (q.status) items = items.filter((x) => x.status === q.status);
  if (q.q) { const s = String(q.q).toLowerCase(); items = items.filter((x) => `${x.invoiceNo} ${x.orderNo} ${x.buyerName} ${x.route}`.toLowerCase().includes(s)); }
  return { items, total: items.length };
};

const forOrder = async (orderId, user) => (await Dispatch.find({ $or: [{ orderId }, { 'lines.orderId': orderId }] }).sort('-invoiceDate')).map((d) => present(d, user));

const summary = async (req) => {
  const cfg = await settings();
  const rows = (await Dispatch.find()).map((d) => present(d, req.user));
  const shipped = rows.filter((d) => ['Shipped On Board', 'In Transit', 'Delivered'].includes(d.status));
  const air = shipped.filter((d) => d.mode === 'Air').length;
  return {
    financialYear: cfg.financialYear, shipments: shipped.length, air, sea: shipped.length - air,
    airPct: shipped.length ? Math.round(air * 100 / shipped.length) : 0, docsPending: rows.reduce((a, d) => a + d.docsPending.length, 0),
    inTransit: rows.filter((d) => ['Shipped On Board', 'In Transit'].includes(d.status)).length,
    drafts: rows.filter((d) => d.status === 'Docs In Progress').map((d) => d.invoiceNo),
    ports: [...new Set(shipped.map((d) => d.portOfLoading).filter(Boolean))],
  };
};

module.exports = { present, statusOf, create, update, docAction, track, docData, list, forOrder, summary, assertShippable, shippedMap, shippingTrack, setBoxes, autoBoxes };
