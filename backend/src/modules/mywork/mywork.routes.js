const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate } = require('../../common/middleware/auth');
const { hasModule, hasFlag } = require('../users/roles');
const tna = require('../tna/tna.service');
const alerts = require('../alerts/alerts.service');
const Po = require('../po/po.model');
const Pattern = require('../pattern/pattern.model');
const Order = require('../orders/order.model');
const User = require('../users/user.model');
const { AqlInspection } = require('../quality/quality.model');

const DAY = 864e5;
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const PRIO = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

/** Bucket by due date: Overdue / Today / This week / Later (FR-24.3) */
const bucket = (due) => {
  if (!due) return 'Later';
  const d = startOfDay(due).getTime(), t = startOfDay().getTime();
  if (d < t) return 'Overdue';
  if (d === t) return 'Today';
  if (d - t <= 7 * DAY) return 'This week';
  return 'Later';
};

/** Everything assigned to one user, across modules (FR-24.1) */
const queueFor = async (req, user) => {
  const items = [];
  const tasks = (await tna.list({ user }, { ownerUid: user.uid, open: 1 })).items;
  tasks.forEach((t) => items.push({ kind: 'tna', id: t.id, title: `${t.activity}`, sub: `${t.orderNo} · ${t.styleNo} · ${t.stage}`, due: t.plannedEnd, priority: t.priority,
    rag: t.rag, replanned: t.replanned, link: `/tna?order=${t.orderId}`, entityNo: t.orderNo, status: t.status }));
  const al = await alerts.list({ user }, {});
  al.items.filter((a) => !a.acknowledgedAt).forEach((a) => items.push({ kind: 'alert', id: a.id, title: a.message, sub: `${a.module} · ${a.severity}`, due: a.createdAt,
    priority: a.severity === 'red' ? 'Urgent' : a.severity === 'amber' ? 'High' : 'Normal', rag: a.severity === 'info' ? 'green' : a.severity, link: a.link, entityNo: a.entityNo, status: 'Open', severity: a.severity }));
  if (hasFlag(user, 'po.approve') && hasModule(user, 'po')) {
    (await Po.find({ status: 'Pending Approval' })).forEach((p) => items.push({ kind: 'approval', id: String(p._id), title: `Approve ${p.poNo} · ${p.materialName}`, sub: `${p.supplierName} · ${p.orderedQty} ${p.uom}`,
      due: p.poDate, priority: p.priority, rag: 'amber', link: `/po?q=${p.poNo}`, entityNo: p.poNo, status: 'Pending' }));
  }
  if (hasFlag(user, 'pattern.approve') && hasModule(user, 'pattern')) {
    (await Pattern.find({ status: 'In Review' })).forEach((p) => items.push({ kind: 'approval', id: String(p._id), title: `Review pattern ${p.patternNo} · ${p.styleNo}`, sub: `by ${p.makerName}`,
      due: p.dueDate, priority: p.priority, rag: p.dueDate && p.dueDate < new Date() ? 'red' : 'amber', link: '/patterns', entityNo: p.patternNo, status: 'In Review' }));
  }
  if (hasModule(user, 'quality')) {
    const passed = new Set((await AqlInspection.find({ stage: 'Final', result: 'Pass' })).map((f) => String(f.orderId)));
    (await Order.find({ status: 'Open', shipDate: { $lte: new Date(Date.now() + 7 * DAY) } })).filter((o) => !passed.has(String(o._id))).forEach((o) =>
      items.push({ kind: 'quality', id: String(o._id), title: `Final inspection due · ${o.orderNo}`, sub: `${o.styleNo} · ships ${o.shipDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
        due: new Date(o.shipDate.getTime() - 2 * DAY), priority: o.priority, rag: 'amber', link: '/quality', entityNo: o.orderNo, status: 'Due' }));
  }
  items.forEach((i) => { i.bucket = bucket(i.due); });
  const B = { Overdue: 0, Today: 1, 'This week': 2, Later: 3 };
  items.sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || B[a.bucket] - B[b.bucket] || new Date(a.due || 0) - new Date(b.due || 0));
  const counts = { Overdue: 0, Today: 0, 'This week': 0, Later: 0 };
  items.forEach((i) => { counts[i.bucket] += 1; });
  return { items, counts, total: items.length };
};

router.use(authenticate);
router.get('/', catchAsync(async (req, res) => res.json(await queueFor(req, req.user))));
router.get('/count', catchAsync(async (req, res) => { const q = await queueFor(req, req.user); res.json({ overdue: q.counts.Overdue, today: q.counts.Today, total: q.total }); }));
/** Admin: everyone's queues — workload heatmap (FR-24.4) */
router.get('/all', catchAsync(async (req, res) => {
  if (req.user.role !== 'Admin') throw ApiError.forbidden('Admin only');
  const users = await User.find({ status: 'Active' }).sort('name');
  const rows = [];
  for (const u of users) { const q = await queueFor(req, u); rows.push({ uid: u.uid, name: u.name, role: u.role, ...q.counts, total: q.total, urgent: q.items.filter((i) => i.priority === 'Urgent').length }); }
  res.json({ items: rows });
}));

module.exports = router;
