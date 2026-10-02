const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate } = require('../../common/middleware/auth');
const { hasModule, hasFlag } = require('../users/roles');
const { buyerLabel } = require('../../common/utils/mask');
const Order = require('../orders/order.model');
const Sample = require('../samples/sample.model');
const Material = require('../materials/material.model');
const Dispatch = require('../dispatch/dispatch.model');
const Payment = require('../payments/payment.model');
const Po = require('../po/po.model');
const JobWork = require('../jobwork/jobwork.model');
const { ProductionOp, ProductionLog, OPS } = require('../production/production.model');
const { TnaTask } = require('../tna/tna.model');
const { AqlInspection, InlineInspection } = require('../quality/quality.model');

const DAY = 864e5;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

router.use(authenticate);

/** One call for the home dashboard — every block is gated by the caller's modules, money by the rates / financial flags. */
router.get('/overview', catchAsync(async (req, res) => {
  const u = req.user;
  const money = hasFlag(u, 'rates.view') || hasFlag(u, 'reports.financial');
  const out = { generatedAt: new Date() };

  if (hasModule(u, 'orders')) {
    const orders = await Order.find().sort('shipDate');
    const open = orders.filter((o) => o.status === 'Open');
    const ops = await ProductionOp.find({ orderId: { $in: open.map((o) => o._id) } });
    const media = await require('../orders/orders.service').photosOf(open);
    const byStage = {};
    Order.STAGES.forEach((s) => { byStage[s] = 0; });
    open.forEach((o) => { byStage[o.stage] = (byStage[o.stage] || 0) + 1; });
    out.orders = {
      open: open.length, total: orders.length, closed: orders.length - open.length,
      qtyOpen: open.reduce((a, o) => a + o.qty, 0), valueOpen: money ? open.reduce((a, o) => a + (o.fobRate || 0) * o.qty, 0) : undefined,
      byStage: Object.entries(byStage).filter(([, n]) => n > 0).map(([stage, n]) => ({ stage, n })),
      byBuyer: Object.values(open.reduce((acc, o) => { const k = buyerLabel(u, o.buyerBrand, o.buyerAlias); acc[k] = acc[k] || { buyer: k, orders: 0, qty: 0 }; acc[k].orders += 1; acc[k].qty += o.qty; return acc; }, {})).sort((a, b) => b.qty - a.qty),
      shippingSoon: open.filter((o) => o.shipDate).slice(0, 6).map((o) => {
        const mine = ops.filter((x) => String(x.orderId) === String(o._id));
        const planned = mine.reduce((a, x) => a + x.plannedQty, 0), done = mine.reduce((a, x) => a + Math.min(x.doneQty, x.plannedQty), 0);
        const now = mine.find((x) => x.doneQty < x.plannedQty && x.doneQty > 0) || mine.find((x) => x.doneQty < x.plannedQty);
        return { id: String(o._id), orderNo: o.orderNo, styleNo: o.styleNo, description: o.description, buyerName: buyerLabel(u, o.buyerBrand, o.buyerAlias), qty: o.qty, shipDate: o.shipDate, priority: o.priority, stage: o.stage,
          daysLeft: Math.ceil((o.shipDate.getTime() - Date.now()) / DAY), floorPct: planned ? Math.round(done * 100 / planned) : 0, now: now ? now.op : (mine.length ? 'Ready' : ''), photo: (media[String(o._id)] || {}).photos?.[0] || null };
      }),
    };
  }

  if (hasModule(u, 'samples')) {
    const samples = await Sample.find().select('status createdAt approvedAt');
    const byStatus = {};
    Sample.STATUSES.forEach((s) => { byStatus[s] = 0; });
    samples.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
    out.samples = { total: samples.length, byStatus: Object.entries(byStatus).map(([status, n]) => ({ status, n })), active: samples.filter((s) => !['Approved', 'Rejected'].includes(s.status)).length, approved: byStatus.Approved || 0 };
  }

  if (hasModule(u, 'production')) {
    const since = new Date(dayKey(new Date(Date.now() - 13 * DAY)));
    const logs = await ProductionLog.find({ date: { $gte: since } }).select('date op output rejected exec where');
    const days = Array.from({ length: 14 }, (_, i) => dayKey(since.getTime() + i * DAY));
    const today = dayKey(new Date());
    const todayLogs = logs.filter((l) => dayKey(l.date) === today);
    const openOps = await ProductionOp.find();
    const outsourced = openOps.filter((o) => o.exec === 'Outsourced' && o.doneQty < o.plannedQty);
    out.production = {
      days: days.map((d) => { const rows = logs.filter((l) => dayKey(l.date) === d); return { date: d, output: rows.reduce((a, l) => a + l.output, 0), rejected: rows.reduce((a, l) => a + l.rejected, 0) }; }),
      todayOutput: todayLogs.reduce((a, l) => a + l.output, 0), todayRejected: todayLogs.reduce((a, l) => a + l.rejected, 0),
      byOp: OPS.map((op) => ({ op, output: logs.filter((l) => l.op === op).reduce((a, l) => a + l.output, 0) })),
      byOpToday: OPS.map((op) => ({ op, output: todayLogs.filter((l) => l.op === op).reduce((a, l) => a + l.output, 0) })),
      pendingAtVendors: outsourced.reduce((a, o) => a + (o.plannedQty - o.doneQty), 0), blocked: openOps.filter((o) => o.blocked).length,
      linesRunning: new Set(todayLogs.filter((l) => l.exec === 'In-house').map((l) => l.where)).size,
    };
    const dhuRows = await InlineInspection.find({ date: { $gte: since } }).select('date dhu checked totalDefects');
    out.production.dhu = days.map((d) => { const rows = dhuRows.filter((r) => dayKey(r.date) === d); const c = rows.reduce((a, r) => a + r.checked, 0); return { date: d, dhu: c ? Math.round(rows.reduce((a, r) => a + r.totalDefects, 0) * 1000 / c) / 10 : null }; });
  }

  if (hasModule(u, 'stock')) {
    const mats = await Material.find({ status: { $ne: 'Inactive' } });
    const st = { Healthy: 0, 'Below Reorder': 0, Short: 0, 'Out of Stock': 0 };
    mats.forEach((m) => { const s = m.stockState ? m.stockState() : 'Healthy'; st[s] = (st[s] || 0) + 1; });
    const cats = {};
    mats.forEach((m) => { cats[m.category] = cats[m.category] || { category: m.category, items: 0, value: 0 }; cats[m.category].items += 1; cats[m.category].value += (m.rate || 0) * (m.physicalQty || 0); });
    out.stock = { total: mats.length, byState: Object.entries(st).map(([state, n]) => ({ state, n })), byCategory: Object.values(cats).map((c) => ({ ...c, value: money ? Math.round(c.value) : undefined })), value: money ? Math.round(mats.reduce((a, m) => a + (m.rate || 0) * (m.physicalQty || 0), 0)) : undefined };
  }

  if (hasModule(u, 'po')) {
    const pos = await Po.find({ status: { $nin: ['Cancelled', 'Closed', 'Received'] } });
    out.po = { open: pos.length, pendingApproval: pos.filter((p) => p.status === 'Pending Approval').length, overdue: pos.filter((p) => p.eta && p.eta < new Date() && p.receivedQty < p.orderedQty).length, value: money ? Math.round(pos.reduce((a, p) => a + (p.value || 0), 0)) : undefined };
  }

  if (hasModule(u, 'jobwork')) {
    const jws = await JobWork.find({ status: { $in: JobWork.OPEN } });
    out.jobwork = { open: jws.length, outside: jws.reduce((a, j) => a + Math.max(j.sentQty - j.returnedQty, 0), 0), overdue: jws.filter((j) => j.dueDate && j.dueDate < new Date()).length, vendors: new Set(jws.map((j) => String(j.vendorId))).size };
  }

  if (hasModule(u, 'tna')) {
    const tasks = await TnaTask.find({ status: { $ne: 'Done' } }).select('plannedEnd status ownerName orderNo activity');
    const now = Date.now();
    const cfg = await require('../settings/settings.routes').getCompany();
    const amber = (cfg.tnaAmberDays || 3) * DAY;
    out.tna = { open: tasks.length, red: tasks.filter((t) => t.plannedEnd && t.plannedEnd.getTime() < now).length, amber: tasks.filter((t) => t.plannedEnd && t.plannedEnd.getTime() >= now && t.plannedEnd.getTime() < now + amber).length,
      byOwner: Object.values(tasks.reduce((acc, t) => { const k = t.ownerName || '—'; acc[k] = acc[k] || { owner: k, open: 0, overdue: 0 }; acc[k].open += 1; if (t.plannedEnd && t.plannedEnd.getTime() < now) acc[k].overdue += 1; return acc; }, {})).sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 6) };
    out.tna.green = out.tna.open - out.tna.red - out.tna.amber;
  }

  if (hasModule(u, 'quality')) {
    const aql = await AqlInspection.find().sort('-date').limit(200).select('result stage');
    out.quality = { aql: ['Pass', 'Fail', 'Hold'].map((r) => ({ result: r, n: aql.filter((a) => a.result === r).length })), finals: aql.filter((a) => a.stage === 'Final').length };
  }

  if (hasModule(u, 'dispatch') || hasModule(u, 'payments')) {
    const months = [];
    for (let i = 11; i >= 0; i -= 1) { const d = new Date(); d.setMonth(d.getMonth() - i, 1); months.push(monthKey(d)); }
    const disp = await Dispatch.find();
    const dispatched = {};
    disp.forEach((d) => { const ob = (d.tracking || []).find((t) => t.key === 'onboard' && t.done); if (ob) dispatched[monthKey(ob.at)] = (dispatched[monthKey(ob.at)] || 0) + (d.qty || 0); });
    const pays = money && hasModule(u, 'payments') ? await Payment.find() : [];
    const realised = {};
    pays.forEach((p) => (p.receipts || []).forEach((r) => { realised[monthKey(r.creditDate)] = (realised[monthKey(r.creditDate)] || 0) + r.amount; }));
    out.trend = { months, dispatched: months.map((k) => dispatched[k] || 0), realised: money && hasModule(u, 'payments') ? months.map((k) => Math.round(realised[k] || 0)) : undefined };
    out.shipping = { invoices: disp.length, inTransit: disp.filter((d) => { const st = require('../dispatch/dispatch.service').statusOf(d); return st === 'In Transit' || st === 'On Board'; }).length };
    if (money && hasModule(u, 'payments')) {
      const recd = (p) => (p.receipts || []).reduce((x, r) => x + (r.amount || 0), 0);
      const open = pays.filter((p) => !(p.amount > 0 && recd(p) >= p.amount));
      out.payments = { openInvoices: open.length, outstanding: Math.round(open.reduce((a, p) => a + Math.max((p.amount || 0) - recd(p), 0), 0)), overdue: open.filter((p) => p.dueDate && p.dueDate < new Date()).length };
    }
  }

  res.json(out);
}));

module.exports = router;
