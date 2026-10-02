const ApiError = require('../../common/utils/api-error');
const { plain } = require('../../common/utils/mask');
const { hasModule } = require('../users/roles');
const logger = require('../../common/logger/logger');
const Alert = require('./alert.model');
const User = require('../users/user.model');
const Order = require('../orders/order.model');
const Po = require('../po/po.model');
const JobWork = require('../jobwork/jobwork.model');
const Sample = require('../samples/sample.model');
const Pattern = require('../pattern/pattern.model');
const { TnaTask } = require('../tna/tna.model');
const { AqlInspection, InlineInspection, FabricInspection } = require('../quality/quality.model');
const { ProductionOp } = require('../production/production.model');
const ComplianceDoc = require('../compliance/compliance.model');
const Payment = require('../payments/payment.model');
const Dispatch = require('../dispatch/dispatch.model');
const log = logger.child({ context: 'AlertEngine' });

const DAY = 864e5;
const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
const fmt = (n) => Number(n).toLocaleString('en-IN');
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—');

/** uids per role (cached per run) */
const roleUids = async () => {
  const users = await User.find({ status: 'Active' }, 'uid role modules');
  const by = (role) => users.filter((u) => u.role === role).map((u) => u.uid);
  const withModule = (m) => users.filter((u) => hasModule(u, m)).map((u) => u.uid);
  return { admins: by('Admin'), merch: by('Merchandising Head'), store: by('Store Manager'), prod: by('Production Manager'), gate: withModule('gate'), users, withModule };
};

/**
 * Evaluate every rule (FR-23.1) → list of { ruleKey, entityKey, severity, module, entityType, entityId, entityNo, message, link, assigned }.
 * Everything here is derived from live records — nothing is typed in.
 */
const evaluate = async () => {
  const s = await settings();
  const R = await roleUids();
  const now = Date.now();
  const out = [];
  const push = (a) => out.push({ ...a, assigned: [...new Set([...(a.assigned || []), ...R.admins])] });

  /* material shortage per open order (lines that still need a PO) */
  const stock = require('../stock/stock.service');
  const orders = await Order.find({ status: 'Open' });
  for (const o of orders) {
    const pos = await stock.orderPosition(o, { role: 'Admin' });
    if (pos.hasBom && pos.toOrderLines > 0) {
      push({ ruleKey: 'material.shortage', entityKey: `material.shortage:${o._id}`, severity: 'amber', module: 'stock', entityType: 'Order', entityId: o._id, entityNo: o.orderNo,
        message: `${o.orderNo}: ${pos.toOrderLines} material line${pos.toOrderLines > 1 ? 's' : ''} need a PO`, link: `/orders/${o._id}`, assigned: [...R.store, ...R.merch] });
    }
    const packShort = pos.rows.filter((r) => r.category === 'Packing' && r.shortage > 0);
    if (packShort.length) {
      push({ ruleKey: 'packing.blocked', entityKey: `packing.blocked:${o._id}`, severity: 'amber', module: 'packing', entityType: 'Order', entityId: o._id, entityNo: o.orderNo,
        message: `${o.orderNo}: packing blocked — ${packShort.map((r) => r.code).join(', ')} short`, link: '/packing', assigned: [...R.prod, ...R.store] });
    }
  }
  /* purchase orders */
  for (const p of await Po.find({ status: { $in: Po.OPEN } })) {
    if (p.eta && p.eta.getTime() < now - DAY) {
      push({ ruleKey: 'po.overdue', entityKey: `po.overdue:${p._id}`, severity: 'red', module: 'po', entityType: 'PurchaseOrder', entityId: p._id, entityNo: p.poNo,
        message: `${p.poNo} ${p.materialName}: ${fmt(p.orderedQty - p.receivedQty)} ${p.uom} overdue vs ETA ${fmtD(p.eta)}`, link: `/po?q=${p.poNo}`, assigned: R.store });
    } else if (p.status === 'Partially Received') {
      push({ ruleKey: 'po.partial', entityKey: `po.partial:${p._id}`, severity: 'info', module: 'po', entityType: 'PurchaseOrder', entityId: p._id, entityNo: p.poNo,
        message: `${p.poNo} partially received — ${fmt(p.orderedQty - p.receivedQty)} ${p.uom} still to come`, link: `/po?q=${p.poNo}`, assigned: R.store });
    }
    if (p.eta && p.eta.getTime() <= now) {
      push({ ruleKey: 'gate.pending', entityKey: `gate.pending:${p._id}`, severity: 'amber', module: 'gate', entityType: 'PurchaseOrder', entityId: p._id, entityNo: p.poNo,
        message: `${p.poNo} due at the gate — ${fmt(p.orderedQty - p.receivedQty)} ${p.uom} not yet verified`, link: `/gate?po=${p._id}`, assigned: R.gate });
    }
  }
  for (const p of await Po.find({ status: 'Pending Approval' })) {
    push({ ruleKey: 'po.approval', entityKey: `po.approval:${p._id}`, severity: 'info', module: 'po', entityType: 'PurchaseOrder', entityId: p._id, entityNo: p.poNo,
      message: `${p.poNo} waits for approval (above the PO limit)`, link: `/po?q=${p.poNo}`, assigned: R.users.filter((u) => (u.flags || []).includes('po.approve')).map((u) => u.uid) });
  }
  /* job work overdue */
  for (const j of await JobWork.find({ status: { $in: JobWork.OPEN } })) {
    if (j.dueDate && j.dueDate.getTime() < now) {
      push({ ruleKey: 'jobwork.overdue', entityKey: `jobwork.overdue:${j._id}`, severity: 'red', module: 'jobwork', entityType: 'JobWork', entityId: j._id, entityNo: j.challanNo,
        message: `${j.challanNo} ${j.process}: ${fmt(j.sentQty - j.returnedQty)} ${j.uom} still at ${j.vendorAlias}, due ${fmtD(j.dueDate)}`, link: '/job-work', assigned: R.prod });
    }
  }
  /* TNA amber / red (FR-19.6) */
  const amberDays = s.tnaAmberDays || 3;
  for (const t of await TnaTask.find({ status: { $ne: 'Done' } })) {
    const end = new Date(t.plannedEnd).setHours(0, 0, 0, 0), today = new Date().setHours(0, 0, 0, 0);
    if (end < today) {
      push({ ruleKey: 'tna.red', entityKey: `tna.red:${t._id}`, severity: 'red', module: 'tna', entityType: 'TnaTask', entityId: t._id, entityNo: t.orderNo,
        message: `${t.orderNo} · ${t.activity} overdue by ${Math.round((today - end) / DAY)} day(s)`, link: `/tna?order=${t.orderId}`, assigned: [t.ownerUid, ...R.merch].filter(Boolean) });
    } else if (end - today <= amberDays * DAY) {
      push({ ruleKey: 'tna.amber', entityKey: `tna.amber:${t._id}`, severity: 'amber', module: 'tna', entityType: 'TnaTask', entityId: t._id, entityNo: t.orderNo,
        message: `${t.orderNo} · ${t.activity} due ${fmtD(t.plannedEnd)}`, link: `/tna?order=${t.orderId}`, assigned: [t.ownerUid].filter(Boolean) });
    }
  }
  /* quality */
  for (const q of await AqlInspection.find({ stage: 'Final', result: { $ne: 'Pass' } })) {
    const later = await AqlInspection.findOne({ orderId: q.orderId, stage: 'Final', result: 'Pass', date: { $gt: q.date } });
    if (later) continue;
    push({ ruleKey: 'quality.final', entityKey: `quality.final:${q._id}`, severity: 'red', module: 'quality', entityType: 'AqlInspection', entityId: q._id, entityNo: q.orderNo,
      message: `${q.orderNo} final inspection ${q.inspNo}: ${q.result} — dispatch blocked`, link: '/quality', assigned: [...R.prod, ...R.merch] });
  }
  const dhuLimit = s.dhuLimit || 5;
  for (const i of await InlineInspection.find({ date: { $gte: new Date(now - 2 * DAY) }, dhu: { $gt: dhuLimit } })) {
    push({ ruleKey: 'quality.dhu', entityKey: `quality.dhu:${i._id}`, severity: 'amber', module: 'quality', entityType: 'InlineInspection', entityId: i._id, entityNo: i.orderNo,
      message: `${i.line || 'Line'} · ${i.orderNo}: DHU ${i.dhu}% above the ${dhuLimit}% limit`, link: '/quality', assigned: R.prod });
  }
  for (const h of await FabricInspection.find({ hold: true })) {
    const days = Math.floor((now - h.date) / DAY);
    push({ ruleKey: 'quality.hold', entityKey: `quality.hold:${h._id}`, severity: days >= 7 ? 'red' : 'amber', module: 'quality', entityType: 'FabricInspection', entityId: h._id, entityNo: h.inspNo,
      message: `${h.materialCode} lot on quality hold for ${days} day(s) — ${fmt(h.holdQty)} excluded from free stock`, link: '/quality', assigned: [...R.store, ...R.prod] });
  }
  /* production blocked */
  for (const op of await ProductionOp.find({ blocked: true })) {
    push({ ruleKey: 'production.blocked', entityKey: `production.blocked:${op._id}`, severity: 'red', module: 'production', entityType: 'ProductionOp', entityId: op._id, entityNo: op.orderNo,
      message: `${op.orderNo} ${op.op} blocked — ${op.blockedReason}`, link: '/production', assigned: R.prod });
  }
  /* samples waiting on the buyer */
  const waitDays = s.sampleWaitDays || 7;
  for (const smp of await Sample.find({ status: { $in: ['Sent', 'Client Review'] } })) {
    const last = smp.rounds.length ? smp.rounds[smp.rounds.length - 1] : null;
    const since = last && last.sentOn ? (now - new Date(last.sentOn)) / DAY : 0;
    if (since > waitDays) {
      push({ ruleKey: 'sample.waiting', entityKey: `sample.waiting:${smp._id}`, severity: 'amber', module: 'samples', entityType: 'Sample', entityId: smp._id, entityNo: smp.sampleNo,
        message: `${smp.sampleNo} ${smp.styleNo} with the buyer for ${Math.floor(since)} days — chase feedback`, link: '/samples', assigned: R.merch });
    }
  }
  /* patterns */
  for (const p of await Pattern.find({ status: { $in: ['Draft', 'In Review'] } })) {
    if (p.status === 'In Review') {
      push({ ruleKey: 'pattern.review', entityKey: `pattern.review:${p._id}`, severity: 'info', module: 'pattern', entityType: 'Pattern', entityId: p._id, entityNo: p.patternNo,
        message: `${p.patternNo} ${p.styleNo} awaits pattern approval`, link: '/patterns', assigned: R.users.filter((u) => (u.flags || []).includes('pattern.approve')).map((u) => u.uid) });
    }
    if (p.dueDate && p.dueDate.getTime() < now) {
      push({ ruleKey: 'pattern.overdue', entityKey: `pattern.overdue:${p._id}`, severity: 'red', module: 'pattern', entityType: 'Pattern', entityId: p._id, entityNo: p.patternNo,
        message: `${p.patternNo} ${p.styleNo} not approved by ${fmtD(p.dueDate)}`, link: '/patterns', assigned: [p.makerUid, ...R.merch].filter(Boolean) });
    }
  }
  /* compliance reminder engine (FR-21.3): offsets before expiry, repeats until renewed or dismissed with reason */
  const offsets = (s.complianceReminderDays || [60, 30, 15, 7, 1]).slice().sort((a, b) => b - a);
  const compliers = R.users.filter((u) => (u.flags || []).includes('compliance.manage')).map((u) => u.uid);
  for (const d of await ComplianceDoc.find({ status: 'Active', expiryDate: { $ne: null } })) {
    const daysLeft = Math.ceil((new Date(d.expiryDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
    if (daysLeft > offsets[0]) continue;
    const dismissed = d.dismissed && d.dismissed.until && new Date(d.dismissed.until) > new Date();
    /* audit trail of reminders: one row per offset crossed */
    const crossed = offsets.filter((o) => daysLeft <= o && !(d.reminders || []).some((r) => r.offsetDays === o));
    if (crossed.length) await ComplianceDoc.updateOne({ _id: d._id }, { $push: { reminders: { $each: crossed.map((o) => ({ offsetDays: o, channel: 'in-app' })) } } });
    if (dismissed) continue;
    const sev = daysLeft < 0 || daysLeft <= 7 ? 'red' : daysLeft <= 30 ? 'amber' : 'info';
    const when = daysLeft < 0 ? `expired ${-daysLeft} day(s) ago` : daysLeft === 0 ? 'expires today' : `expires in ${daysLeft} day(s) (${fmtD(d.expiryDate)})`;
    push({ ruleKey: 'compliance.expiry', entityKey: `compliance.expiry:${d._id}`, severity: sev, module: 'compliance', entityType: 'ComplianceDoc', entityId: d._id, entityNo: d.docNo,
      message: `${d.title}${d.number ? ' · ' + d.number : ''} ${when}${d.renewalInProgress ? ' — renewal in progress' : ' — renew'}`, link: '/compliance', assigned: [d.ownerUid, ...compliers].filter(Boolean) });
  }
  /* payments overdue vs due date */
  for (const p of await Payment.find()) {
    const pending = p.amount - p.receivedTotal;
    if (pending > 0 && p.dueDate && p.dueDate.getTime() < now) {
      push({ ruleKey: 'payment.overdue', entityKey: `payment.overdue:${p._id}`, severity: 'red', module: 'payments', entityType: 'Payment', entityId: p._id, entityNo: p.invoiceNo,
        message: `${p.invoiceNo} (${p.method}): payment overdue since ${fmtD(p.dueDate)}`, link: '/payments', assigned: R.users.filter((u) => u.role === 'Accounts').map((u) => u.uid) });
    }
  }
  /* shipment documents pending with the ship date here */
  const orderById = Object.fromEntries(orders.map((o) => [String(o._id), o]));
  for (const d of await Dispatch.find()) {
    const pend = d.documents.filter((x) => x.status === 'Pending');
    const o = orderById[String(d.orderId)];
    if (pend.length && !d.tracking.some((t) => t.key === 'onboard' && t.done) && o && o.shipDate && o.shipDate.getTime() - now <= 2 * DAY) {
      push({ ruleKey: 'dispatch.docs', entityKey: `dispatch.docs:${d._id}`, severity: 'amber', module: 'dispatch', entityType: 'Dispatch', entityId: d._id, entityNo: d.invoiceNo,
        message: `${d.invoiceNo}: ${pend.map((x) => x.type).join(', ')} pending — ships ${fmtD(o.shipDate)}`, link: '/dispatch', assigned: R.users.filter((u) => u.role === 'Accounts').map((u) => u.uid) });
    }
  }
  return out;
};

let lastRun = 0, running = null;
/** Upsert open alerts, resolve the ones whose rule no longer matches, escalate old unacknowledged reds (FR-23.2/5). */
const compute = async () => {
  if (running) return running;
  running = (async () => {
    const found = await evaluate();
    const keys = new Set(found.map((a) => a.entityKey));
    let created = 0;
    for (const a of found) {
      const r = await Alert.updateOne({ entityKey: a.entityKey, resolvedAt: null },
        { $set: { ...a, lastSeenAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      if (r.upsertedCount) created += 1;
    }
    const gone = await Alert.updateMany({ resolvedAt: null, entityKey: { $nin: [...keys] } }, { $set: { resolvedAt: new Date() } });
    const s = await settings();
    const hours = s.escalateHours || 24;
    const admins = (await roleUids()).admins;
    const esc = await Alert.updateMany({ resolvedAt: null, severity: 'red', acknowledgedAt: null, escalatedAt: null, createdAt: { $lte: new Date(Date.now() - hours * 3600e3) } },
      { $set: { escalatedAt: new Date() }, $addToSet: { assigned: { $each: admins } } });
    lastRun = Date.now();
    if (created || gone.modifiedCount || esc.modifiedCount) log.info(`alerts · ${found.length} open · +${created} new · ${gone.modifiedCount} resolved · ${esc.modifiedCount} escalated`);
    return { open: found.length, created, resolved: gone.modifiedCount, escalated: esc.modifiedCount };
  })().finally(() => { running = null; });
  return running;
};
const ensureFresh = async (maxAgeMs = 60e3) => { if (Date.now() - lastRun > maxAgeMs) await compute(); };

const list = async (req, q = {}) => {
  await ensureFresh();
  const f = { resolvedAt: null };
  if (!(q.all && req.user.role === 'Admin')) f.assigned = req.user.uid;
  if (q.module) f.module = q.module;
  if (q.severity) f.severity = q.severity;
  const rows = await Alert.find(f).sort({ severity: 1, createdAt: -1 }).limit(500);
  const order = { red: 0, amber: 1, info: 2 };
  const items = rows.map(plain).sort((a, b) => order[a.severity] - order[b.severity] || (a.acknowledgedAt ? 1 : 0) - (b.acknowledgedAt ? 1 : 0));
  return { items, total: items.length, red: items.filter((a) => a.severity === 'red').length, amber: items.filter((a) => a.severity === 'amber').length,
    unacknowledged: items.filter((a) => !a.acknowledgedAt).length };
};
const acknowledge = async (req, id) => {
  const a = await Alert.findById(id);
  if (!a) throw ApiError.notFound('Alert not found');
  if (!a.acknowledgedAt) { a.acknowledgedAt = new Date(); a.acknowledgedBy = req.user.name; await a.save(); }
  return plain(a);
};

module.exports = { evaluate, compute, ensureFresh, list, acknowledge };
