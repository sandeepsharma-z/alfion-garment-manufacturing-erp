const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const { buyerLabel, vendorLabel } = require('../../common/utils/mask');
const Order = require('../orders/order.model');
const Dispatch = require('../dispatch/dispatch.model');
const Payment = require('../payments/payment.model');
const JobWork = require('../jobwork/jobwork.model');
const Po = require('../po/po.model');
const Material = require('../materials/material.model');
const Bom = require('../bom/bom.model');
const { ProductionOp, ProductionLog } = require('../production/production.model');
const { InlineInspection, AqlInspection } = require('../quality/quality.model');
const { TnaTask } = require('../tna/tna.model');
const Ledger = require('../stock/ledger.model');
const Sample = require('../samples/sample.model');
const Pattern = require('../pattern/pattern.model');
const dispatchSvc = require('../dispatch/dispatch.service');
const paymentsSvc = require('../payments/payments.service');

const DAY = 864e5;
const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
const money = (u) => hasFlag(u, 'reports.financial') || hasFlag(u, 'rates.view');
const fin = (req) => { if (!money(req.user)) throw ApiError.forbidden('This report needs the financial-reports flag'); };
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

router.use(authenticate, requireModule('reports'));

/** Standard report register (M-16) — key, title, description, frequency, financial? */
const REGISTER = [
  { key: 'order-status', title: 'Order Status Summary', description: 'Stage-wise position of every live order with Control Tower health', frequency: 'Daily' },
  { key: 'material-consumption', title: 'Material Consumption vs Standard', description: 'Issued (job work) and reserved against BOM requirement per order', frequency: 'Per order' },
  { key: 'jobwork-pending', title: 'Job Work Pending Register', description: 'Material lying with vendors, ageing wise', frequency: 'Weekly' },
  { key: 'production-efficiency', title: 'Production Efficiency & DHU', description: 'Line-wise output, efficiency and quality (last 7 days)', frequency: 'Daily' },
  { key: 'stock-ageing', title: 'Stock Ageing & Reorder', description: 'Slow-moving material and reorder suggestion', frequency: 'Monthly' },
  { key: 'export-realisation', title: 'Export Realisation (LC / T-T)', description: 'Invoice to payment realisation days', frequency: 'Monthly', financial: true },
  { key: 'buyer-profitability', title: 'Buyer Profitability', description: 'FOB value vs material + job-work cost per order', frequency: 'Per order', financial: true },
  { key: 'tna-delay', title: 'TNA Delay Report', description: 'Open TNA tasks past their planned end, by order and owner', frequency: 'Daily' },
  { key: 'quality-dhu', title: 'Quality / DHU Trend', description: 'Daily DHU per line and AQL results (last 30 days)', frequency: 'Weekly' },
  { key: 'compliance-expiry', title: 'Compliance Expiry Register', description: 'Every licence, policy and certificate with days to expiry', frequency: 'Monthly' },
  { key: 'priority-ageing', title: 'Priority Ageing Report', description: 'Urgent / High items across modules and how long they have been open', frequency: 'Daily' },
];
router.get('/register', (req, res) => res.json({ items: REGISTER.map((r) => ({ ...r, allowed: !r.financial || money(req.user) })) }));

/* ---------- headline KPIs + charts ---------- */
router.get('/kpis', catchAsync(async (req, res) => {
  const cfg = await settings();
  const orders = await Order.find();
  const byId = Object.fromEntries(orders.map((o) => [String(o._id), o]));
  const disp = await Dispatch.find();
  const shipped = disp.filter((d) => dispatchSvc.statusOf(d) !== 'Docs In Progress' && dispatchSvc.statusOf(d) !== 'Ready to Ship');
  const onTime = shipped.filter((d) => { const o = byId[String(d.orderId)]; const ob = d.tracking.find((t) => t.key === 'onboard' && t.done); return o && o.shipDate && ob && ob.at <= new Date(o.shipDate.getTime() + DAY); });
  const since7 = new Date(Date.now() - 7 * DAY);
  const logs = await ProductionLog.find({ date: { $gte: since7 }, exec: 'In-house' });
  const lines = cfg.lines || [];
  const busy = new Set(logs.map((l) => l.where)).size;
  const boms = await Bom.find();
  const fabricLines = boms.flatMap((b) => b.lines.filter((l) => /^FAB/i.test(l.materialCode || '')));
  const wastage = fabricLines.length ? Math.round(fabricLines.reduce((a, l) => a + (l.wastePct || 0), 0) / fabricLines.length * 10) / 10 : 0;
  let margin = null;
  if (money(req.user)) {
    const pos = await Po.find({ orderId: { $ne: null }, status: { $ne: 'Cancelled' } });
    const jws = await JobWork.find({ status: { $ne: 'Cancelled' } });
    const withValue = orders.filter((o) => o.fobRate > 0);
    const rev = withValue.reduce((a, o) => a + o.fobRate * o.qty, 0);
    const cost = pos.filter((p) => withValue.some((o) => String(o._id) === String(p.orderId))).reduce((a, p) => a + p.value, 0)
      + jws.filter((j) => withValue.some((o) => String(o._id) === String(j.orderId))).reduce((a, j) => a + (j.rate || 0) * j.sentQty, 0);
    margin = rev ? Math.round((rev - cost) * 1000 / rev) / 10 : null;
  }
  res.json({
    onTimePct: shipped.length ? Math.round(onTime.length * 100 / shipped.length) : null, shipments: shipped.length,
    capacityPct: lines.length ? Math.round(busy * 100 / lines.length) : null, linesTotal: lines.length, linesBusy: busy,
    wastagePct: wastage, wastageTarget: 4, grossMarginPct: margin,
  });
}));

router.get('/trend', catchAsync(async (req, res) => {
  const months = [];
  for (let i = 11; i >= 0; i -= 1) { const d = new Date(); d.setMonth(d.getMonth() - i, 1); months.push(monthKey(d)); }
  const disp = await Dispatch.find();
  const pays = await Payment.find();
  const dispatched = {}, realised = {};
  disp.forEach((d) => { const ob = d.tracking.find((t) => t.key === 'onboard' && t.done); if (ob) dispatched[monthKey(ob.at)] = (dispatched[monthKey(ob.at)] || 0) + (d.qty || 0); });
  pays.forEach((p) => p.receipts.forEach((r) => { realised[monthKey(r.creditDate)] = (realised[monthKey(r.creditDate)] || 0) + r.amount; }));
  const m = money(req.user);
  res.json({ months, dispatched: months.map((k) => dispatched[k] || 0), realised: m ? months.map((k) => realised[k] || 0) : undefined });
}));

router.get('/buyers', catchAsync(async (req, res) => {
  const orders = await Order.find();
  const disp = await Dispatch.find();
  const groups = {};
  orders.forEach((o) => {
    const k = buyerLabel(req.user, o.buyerBrand, o.buyerAlias);
    const g = groups[k] = groups[k] || { buyer: k, orders: 0, live: 0, qty: 0, value: 0, shipped: 0, onTime: 0 };
    g.orders += 1; if (o.status === 'Open') g.live += 1; g.qty += o.qty; g.value += (o.fobRate || 0) * o.qty;
    disp.filter((d) => String(d.orderId) === String(o._id)).forEach((d) => { const ob = d.tracking.find((t) => t.key === 'onboard' && t.done); if (ob) { g.shipped += 1; if (o.shipDate && ob.at <= new Date(o.shipDate.getTime() + DAY)) g.onTime += 1; } });
  });
  const m = money(req.user);
  res.json({ items: Object.values(groups).sort((a, b) => b.value - a.value).map((g) => ({ ...g, value: m ? g.value : undefined, onTimePct: g.shipped ? Math.round(g.onTime * 100 / g.shipped) : null })) });
}));

router.get('/process-cost', catchAsync(async (req, res) => {
  fin(req);
  const jws = await JobWork.find({ status: { $ne: 'Cancelled' } });
  const by = {};
  jws.forEach((j) => { const k = j.process === 'Other' && j.processDesc ? j.processDesc : j.process; by[k] = (by[k] || 0) + (j.rate || 0) * j.sentQty; });
  const items = Object.entries(by).map(([process, value]) => ({ process, value })).sort((a, b) => b.value - a.value);
  res.json({ items, total: items.reduce((a, x) => a + x.value, 0) });
}));

/* ---------- runnable reports ---------- */
const col = (key, label, num = false) => ({ key, label, num });
const runners = {
  'order-status': async (req) => {
    const orders = await Order.find({ status: 'Open' }).sort('shipDate');
    const rows = [];
    for (const o of orders) {
      const ops = await ProductionOp.find({ orderId: o._id });
      const done = ops.reduce((a, x) => a + Math.min(x.doneQty, x.plannedQty), 0), planned = ops.reduce((a, x) => a + x.plannedQty, 0);
      const tna = await TnaTask.find({ orderId: o._id, status: { $ne: 'Done' } });
      rows.push({ orderNo: o.orderNo, buyer: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), styleNo: o.styleNo, qty: o.qty, shipDate: o.shipDate, stage: o.stage, priority: o.priority,
        progress: planned ? Math.round(done * 100 / planned) : 0, tnaOverdue: tna.filter((t) => t.plannedEnd < new Date()).length, daysToShip: o.shipDate ? Math.ceil((o.shipDate - Date.now()) / DAY) : null });
    }
    return { columns: [col('orderNo', 'Order'), col('buyer', 'Buyer'), col('styleNo', 'Style'), col('qty', 'Qty', true), col('shipDate', 'Ship date'), col('daysToShip', 'Days to ship', true), col('stage', 'Stage'), col('priority', 'Priority'), col('progress', 'Progress %', true), col('tnaOverdue', 'TNA overdue', true)], rows };
  },
  'material-consumption': async (req) => {
    const stock = require('../stock/stock.service');
    const rows = [];
    for (const o of await Order.find({ status: 'Open' })) {
      const pos = await stock.orderPosition(o, req.user);
      const issued = await Ledger.aggregate([{ $match: { orderId: o._id, txn: 'issue_jw' } }, { $group: { _id: '$materialId', qty: { $sum: { $abs: '$qty' } } } }]);
      const issuedBy = Object.fromEntries(issued.map((x) => [String(x._id), x.qty]));
      pos.rows.forEach((r) => rows.push({ orderNo: o.orderNo, code: r.code, name: r.name, uom: r.uom, required: r.required, reserved: r.reservedForOrder, issued: issuedBy[String(r.materialId)] || 0, variance: (issuedBy[String(r.materialId)] || 0) - r.required, status: r.status }));
    }
    return { columns: [col('orderNo', 'Order'), col('code', 'Code'), col('name', 'Material'), col('uom', 'UOM'), col('required', 'Standard (BOM)', true), col('reserved', 'Reserved', true), col('issued', 'Issued to JW', true), col('variance', 'Variance', true), col('status', 'Status')], rows };
  },
  'jobwork-pending': async (req) => {
    const rows = (await JobWork.find({ status: { $in: JobWork.OPEN } }).sort('outDate')).map((j) => ({ challanNo: j.challanNo, orderNo: j.orderNo, vendor: vendorLabel(req.user, j.vendorName, j.vendorAlias, j.process), process: j.process, item: j.itemDesc,
      sent: j.sentQty, returned: j.returnedQty, pending: j.sentQty - j.returnedQty, uom: j.uom, outDate: j.outDate, dueDate: j.dueDate, ageDays: Math.floor((Date.now() - j.outDate) / DAY), overdue: j.dueDate && j.dueDate < new Date() ? 'Yes' : '' }));
    return { columns: [col('challanNo', 'Challan'), col('orderNo', 'Order'), col('vendor', 'Vendor'), col('process', 'Process'), col('item', 'Item'), col('sent', 'Sent', true), col('returned', 'Returned', true), col('pending', 'With vendor', true), col('uom', 'UOM'), col('outDate', 'Issued'), col('dueDate', 'Due'), col('ageDays', 'Age (days)', true), col('overdue', 'Overdue')], rows };
  },
  'production-efficiency': async () => {
    const cfg = await settings();
    const logs = await ProductionLog.find({ date: { $gte: new Date(Date.now() - 7 * DAY) } });
    const by = {};
    logs.forEach((l) => { const k = `${l.where}|${l.op}`; const g = by[k] = by[k] || { line: l.where, op: l.op, exec: l.exec, days: new Set(), output: 0, rejected: 0, workers: 0 }; g.days.add(l.date.toDateString()); g.output += l.output; g.rejected += l.rejected; g.workers += l.workers; });
    const rows = Object.values(by).map((g) => ({ line: g.line, op: g.op, exec: g.exec, days: g.days.size, output: g.output, perDay: Math.round(g.output / g.days.size), rejected: g.rejected, dhu: g.output + g.rejected ? Math.round(g.rejected * 1000 / (g.output + g.rejected)) / 10 : 0,
      efficiency: g.exec === 'In-house' ? Math.round(g.output / g.days.size * 100 / (cfg.lineTarget || 800)) : null })).sort((a, b) => b.output - a.output);
    return { columns: [col('line', 'Line / vendor'), col('op', 'Operation'), col('exec', 'Execution'), col('days', 'Days logged', true), col('output', 'Output (7 d)', true), col('perDay', 'Per day', true), col('efficiency', 'Efficiency %', true), col('rejected', 'Rejected', true), col('dhu', 'DHU %', true)], rows };
  },
  'stock-ageing': async (req) => {
    const mats = await Material.find({ status: 'Active' }).sort('code');
    const rows = [];
    for (const m of mats) {
      const last = await Ledger.findOne({ materialId: m._id, txn: { $in: ['issue_jw', 'issue_prod', 'reserve'] } }).sort('-createdAt');
      const lastIn = await Ledger.findOne({ materialId: m._id, txn: { $in: ['receipt', 'opening'] } }).sort('-createdAt');
      const age = lastIn ? Math.floor((Date.now() - lastIn.createdAt) / DAY) : null;
      rows.push({ code: m.code, name: m.name, category: m.category, physical: m.physicalQty, reserved: m.reservedQty, free: m.physicalQty - m.reservedQty, uom: m.uom, reorderLevel: m.reorderLevel, ageDays: age,
        lastMovement: last ? last.createdAt : null, state: m.stockState(), suggestion: m.stockState() === 'Healthy' ? (age !== null && age > 90 && m.physicalQty - m.reservedQty > 0 ? 'Slow moving — review' : '') : `Reorder ${Math.max(m.reorderLevel * 2 - m.physicalQty, m.reorderLevel).toLocaleString('en-IN')} ${m.uom}`,
        value: money(req.user) ? Math.round(m.physicalQty * (m.rate || 0)) : undefined });
    }
    const columns = [col('code', 'Code'), col('name', 'Material'), col('category', 'Category'), col('physical', 'Physical', true), col('reserved', 'Reserved', true), col('free', 'Free', true), col('uom', 'UOM'), col('reorderLevel', 'Reorder level', true), col('ageDays', 'Stock age (days)', true), col('state', 'State'), col('suggestion', 'Suggestion')];
    if (money(req.user)) columns.push(col('value', 'Value ₹', true));
    return { columns, rows };
  },
  'export-realisation': async (req) => {
    fin(req);
    const rows = (await Payment.find().sort('-invoiceDate')).map((p) => paymentsSvc.present(p, req.user)).map((p) => ({ invoiceNo: p.invoiceNo, orderNo: p.orderNo, buyer: p.buyerName, method: p.method, bank: p.bank, terms: p.terms, invoiceDate: p.invoiceDate, dueDate: p.dueDate,
      amount: p.amount, received: p.receivedTotal, pending: p.pending, charges: p.bankCharges, status: p.displayStatus, realisationDays: p.realisationDays, fxRate: p.receipts.length ? p.receipts[p.receipts.length - 1].fxRate : null, brc: p.receipts.map((r) => r.reference).filter(Boolean).join(', ') }));
    return { columns: [col('invoiceNo', 'Invoice'), col('orderNo', 'Order'), col('buyer', 'Buyer'), col('method', 'Method'), col('bank', 'Bank'), col('terms', 'Terms'), col('invoiceDate', 'Invoice date'), col('dueDate', 'Due'), col('amount', 'Invoice ₹', true), col('received', 'Received ₹', true), col('pending', 'Pending ₹', true), col('charges', 'Bank charges ₹', true), col('fxRate', 'FX rate', true), col('brc', 'BRC / FIRC'), col('status', 'Status'), col('realisationDays', 'Realisation days', true)], rows };
  },
  'buyer-profitability': async (req) => {
    fin(req);
    const rows = [];
    for (const o of await Order.find().sort('-createdAt')) {
      const pos = await Po.find({ orderId: o._id, status: { $ne: 'Cancelled' } });
      const jws = await JobWork.find({ orderId: o._id, status: { $ne: 'Cancelled' } });
      const fob = (o.fobRate || 0) * o.qty, material = pos.reduce((a, p) => a + p.value, 0), jobwork = jws.reduce((a, j) => a + (j.rate || 0) * j.sentQty, 0);
      rows.push({ orderNo: o.orderNo, buyer: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), styleNo: o.styleNo, qty: o.qty, fobRate: o.fobRate, fob, material, jobwork, cost: material + jobwork, margin: fob - material - jobwork, marginPct: fob ? Math.round((fob - material - jobwork) * 1000 / fob) / 10 : null, status: o.status });
    }
    return { columns: [col('orderNo', 'Order'), col('buyer', 'Buyer'), col('styleNo', 'Style'), col('qty', 'Qty', true), col('fobRate', 'FOB / pc ₹', true), col('fob', 'FOB value ₹', true), col('material', 'Material POs ₹', true), col('jobwork', 'Job work ₹', true), col('cost', 'Landed cost ₹', true), col('margin', 'Margin ₹', true), col('marginPct', 'Margin %', true), col('status', 'Status')], rows,
      note: 'Landed cost = purchase orders raised against the order + job-work rate × quantity sent. In-house labour and overheads are not yet costed.' };
  },
  'tna-delay': async (req) => {
    const tna = require('../tna/tna.service');
    const items = (await tna.list(req, { open: 1, size: 2000 })).items.filter((t) => t.rag === 'red' || t.rag === 'amber').sort((a, b) => b.delayDays - a.delayDays);
    return { columns: [col('orderNo', 'Order'), col('buyerName', 'Buyer'), col('activity', 'Activity'), col('stage', 'Stage'), col('ownerName', 'Owner'), col('plannedEnd', 'Planned end'), col('delayDays', 'Delay (days)', true), col('priority', 'Priority'), col('replanCount', 'Replans', true), col('rag', 'RAG')], rows: items };
  },
  'quality-dhu': async () => {
    const since = new Date(Date.now() - 30 * DAY);
    const inl = await InlineInspection.find({ date: { $gte: since } }).sort('-date');
    const rows = inl.map((i) => ({ date: i.date, line: i.line, orderNo: i.orderNo, kind: i.kind, checked: i.checked, defects: i.totalDefects, dhu: i.dhu, top: i.defects.slice(0, 2).map((d) => `${d.name} ${d.count}`).join(', '), inspector: i.inspector }));
    const aql = (await AqlInspection.find({ date: { $gte: since } }).sort('-date')).map((a) => ({ date: a.date, line: `AQL ${a.stage}`, orderNo: a.orderNo, kind: a.inspNo, checked: a.sampleSize, defects: a.majors + a.minors, dhu: a.sampleSize ? Math.round((a.majors + a.minors) * 1000 / a.sampleSize) / 10 : 0, top: `${a.majors} major / ${a.minors} minor · ${a.result}`, inspector: a.inspector }));
    return { columns: [col('date', 'Date'), col('line', 'Line / stage'), col('orderNo', 'Order'), col('kind', 'Type'), col('checked', 'Checked', true), col('defects', 'Defects', true), col('dhu', 'DHU %', true), col('top', 'Top defects / result'), col('inspector', 'Inspector')], rows: [...rows, ...aql] };
  },
  'compliance-expiry': async (req) => {
    const Doc = require('../compliance/compliance.model');
    const { present } = require('../compliance/compliance.routes');
    const cfg = await settings();
    const vis = hasFlag(req.user, 'compliance.confidential') ? {} : { $or: [{ confidential: { $ne: true } }, { ownerUid: req.user.uid }] };
    const rows = (await Doc.find({ status: 'Active', ...vis }).sort('expiryDate')).map((d) => present(d, req.user, Math.max(...(cfg.complianceReminderDays || [60])))).map((d) => ({ docNo: d.docNo, title: d.title, category: d.category, authority: d.authority, number: d.number, issueDate: d.issueDate, expiryDate: d.expiryDate, daysLeft: d.daysLeft, state: d.state, owner: d.ownerName, reminders: d.reminders.length }));
    return { columns: [col('docNo', 'Doc'), col('title', 'Title'), col('category', 'Category'), col('authority', 'Authority'), col('number', 'Number'), col('issueDate', 'Issued'), col('expiryDate', 'Expiry'), col('daysLeft', 'Days left', true), col('state', 'State'), col('owner', 'Owner'), col('reminders', 'Reminders sent', true)], rows };
  },
  'priority-ageing': async (req) => {
    const rows = [];
    const age = (d) => Math.floor((Date.now() - new Date(d)) / DAY);
    (await Order.find({ status: 'Open', priority: { $in: ['Urgent', 'High'] } })).forEach((o) => rows.push({ module: 'Orders', ref: o.orderNo, item: o.description, priority: o.priority, due: o.shipDate, openDays: age(o.createdAt), owner: o.createdBy }));
    (await Sample.find({ status: { $nin: ['Approved', 'Rejected'] }, priority: { $in: ['Urgent', 'High'] } })).forEach((s) => rows.push({ module: 'Samples', ref: s.sampleNo, item: s.styleNo, priority: s.priority, due: s.targetDate, openDays: age(s.createdAt), owner: s.merchandiser }));
    (await Po.find({ status: { $in: Po.OPEN }, priority: { $in: ['Urgent', 'High'] } })).forEach((p) => rows.push({ module: 'Purchase Orders', ref: p.poNo, item: p.materialName, priority: p.priority, due: p.eta, openDays: age(p.poDate), owner: p.createdBy }));
    (await JobWork.find({ status: { $in: JobWork.OPEN }, priority: { $in: ['Urgent', 'High'] } })).forEach((j) => rows.push({ module: 'Job Work', ref: j.challanNo, item: `${j.process} · ${j.itemDesc}`, priority: j.priority, due: j.dueDate, openDays: age(j.outDate), owner: j.vendorAlias }));
    (await TnaTask.find({ status: { $ne: 'Done' }, priority: { $in: ['Urgent', 'High'] } })).forEach((t) => rows.push({ module: 'TNA', ref: t.orderNo, item: t.activity, priority: t.priority, due: t.plannedEnd, openDays: age(t.plannedStart), owner: t.ownerName }));
    (await Pattern.find({ status: { $in: ['Draft', 'In Review'] }, priority: { $in: ['Urgent', 'High'] } })).forEach((p) => rows.push({ module: 'Patterns', ref: p.patternNo, item: p.styleNo, priority: p.priority, due: p.dueDate, openDays: age(p.createdAt), owner: p.makerName }));
    rows.sort((a, b) => (a.priority === b.priority ? b.openDays - a.openDays : a.priority === 'Urgent' ? -1 : 1));
    return { columns: [col('module', 'Module'), col('ref', 'Reference'), col('item', 'Item'), col('priority', 'Priority'), col('due', 'Due'), col('openDays', 'Open for (days)', true), col('owner', 'Owner')], rows };
  },
};

router.get('/run/:key', catchAsync(async (req, res) => {
  const r = REGISTER.find((x) => x.key === req.params.key);
  if (!r || !runners[r.key]) throw ApiError.notFound('Unknown report');
  const out = await runners[r.key](req);
  res.json({ key: r.key, title: r.title, description: r.description, generatedAt: new Date(), ...out, total: out.rows.length });
}));

module.exports = router;
