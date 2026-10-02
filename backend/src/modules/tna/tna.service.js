const ApiError = require('../../common/utils/api-error');
const { hasFlag, hasModule } = require('../users/roles');
const { plain, buyerLabel } = require('../../common/utils/mask');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const { TnaTemplate, TnaTask, ACTIVITIES, DEFAULT_STAGES, cleanStages } = require('./tna.model');
const Order = require('../orders/order.model');
const User = require('../users/user.model');
const log = logger.child({ context: 'TnaService' });

const DAY = 864e5;
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);
const settings = async () => (await require('../settings/settings.routes').getCompany()).toObject();
/** Configured pipeline: [{ name, portal }] — falls back to the defaults when nothing is saved. */
const stagesCfg = async () => { const s = (await settings()).tnaStages; return Array.isArray(s) && s.length ? s.map((x) => ({ name: x.name, portal: x.portal !== false })) : DEFAULT_STAGES; };
const stageNames = async () => (await stagesCfg()).map((s) => s.name);

/* ---------- derived state (FR-19.4) ---------- */
const ragOf = (t, amberDays) => {
  if (t.status === 'Done') return 'done';
  const today = startOfDay().getTime(), end = startOfDay(t.plannedEnd).getTime();
  if (end < today) return 'red';
  if (end - today <= amberDays * DAY) return 'amber';
  return 'green';
};
const present = (doc, user, amberDays = 3) => {
  const t = plain(doc);
  t.rag = ragOf(t, amberDays);
  t.delayDays = t.status === 'Done' ? Math.max(Math.round((startOfDay(t.actualEnd || new Date()) - startOfDay(t.plannedEnd)) / DAY), 0)
    : Math.max(Math.round((startOfDay() - startOfDay(t.plannedEnd)) / DAY), 0);
  t.buyerName = buyerLabel(user, t.buyerBrand, t.buyerAlias);
  t.replanned = t.replanCount > 0;
  /* the plan fills itself as the work happens — say so, and whether it was an approval */
  t.auto = /^Auto-completed/i.test(t.remark || '');
  t.doneLabel = t.status !== 'Done' ? '' : t.auto ? (/approv/i.test(t.remark || '') ? 'Approved' : 'Completed') : 'Marked done';
  return t;
};
const worst = (rags) => (rags.includes('red') ? 'red' : rags.includes('amber') ? 'amber' : rags.includes('green') ? 'green' : rags.length ? 'done' : 'none');

/* ---------- templates ---------- */
const defaultItems = (names = []) => ACTIVITIES.map((a) => ({ ...a, stage: !names.length || names.includes(a.stage) ? a.stage : names[0] }));   // unknown stage → first configured

const templateFor = async (order) => {
  const byBuyer = await TnaTemplate.findOne({ buyerId: order.buyerId, status: 'Active' });
  if (byBuyer) return byBuyer;
  return (await TnaTemplate.findOne({ isDefault: true, status: 'Active' })) || TnaTemplate.findOne({ status: 'Active' });
};

const ownerFor = async (role, cache) => {
  if (!cache[role]) cache[role] = (await User.findOne({ role, status: 'Active' })) || (await User.findOne({ role: 'Admin', status: 'Active' }));
  return cache[role];
};

/** Apply a template to an order (FR-19.2) — generates tasks; `force` replaces existing open tasks. */
const applyTemplate = async (req, order, templateId, force = false) => {
  const existing = await TnaTask.countDocuments({ orderId: order._id });
  if (existing && !force) throw ApiError.conflict(`${order.orderNo} already has a TNA (${existing} tasks) — use replace to regenerate`);
  const tpl = templateId ? await TnaTemplate.findById(templateId) : await templateFor(order);
  if (!tpl) throw ApiError.badRequest('No TNA template found — create one under TNA → Templates');
  if (force) await TnaTask.deleteMany({ orderId: order._id, status: { $ne: 'Done' } });
  const orderDate = startOfDay(order.createdAt || new Date());
  const exf = order.shipDate ? startOfDay(order.shipDate) : addDays(orderDate, 60);
  const cache = {};
  const names = await stageNames();
  const doneKeys = new Set((await TnaTask.find({ orderId: order._id, status: 'Done' })).map((t) => t.key));
  const docs = [];
  let seq = 0;
  for (const it of tpl.items) {
    seq += 1;
    if (doneKeys.has(it.key)) continue;
    const anchor = it.anchor === 'order' ? orderDate : exf;
    const start = addDays(anchor, it.offsetDays);
    const owner = await ownerFor(it.ownerRole, cache);
    docs.push({
      orderId: order._id, orderNo: order.orderNo, buyerId: order.buyerId, buyerBrand: order.buyerBrand, buyerAlias: order.buyerAlias, styleNo: order.styleNo,
      seq, key: it.key, activity: it.activity, stage: it.stage || names[0], dept: it.dept, ownerUid: owner ? owner.uid : '', ownerName: owner ? owner.name : '',
      plannedStart: start, plannedEnd: addDays(start, Math.max(it.durationDays - 1, 0)), priority: order.priority || 'Normal', sourceEvent: it.sourceEvent, templateName: tpl.name,
    });
  }
  const created = await TnaTask.insertMany(docs);
  if (req) audit.record(req, 'tna.apply', `Order:${order.orderNo}`, null, { template: tpl.name, tasks: created.length, force });
  log.info(`TNA applied · ${order.orderNo} · ${tpl.name} · ${created.length} tasks`);
  return created;
};

/** Auto-fill actuals from module events (FR-19.3). Safe to call for orders without a TNA. */
const markEvent = async (orderId, eventKey, date = new Date(), by = 'system') => {
  if (!orderId || !eventKey) return 0;
  const r = await TnaTask.updateMany({ orderId, sourceEvent: eventKey, status: { $ne: 'Done' } },
    { $set: { status: 'Done', actualEnd: date, remark: `Auto-completed by ${by}` }, $min: { actualStart: date } });
  if (r.modifiedCount) log.info(`TNA event · ${eventKey} · order ${orderId} · ${r.modifiedCount} task(s) done`);
  return r.modifiedCount;
};

/* ---------- tasks ---------- */
const list = async (req, q = {}) => {
  const { amberDays } = await amber();
  const f = {};
  if (q.mine) f.ownerUid = req.user.uid;
  if (q.ownerUid) f.ownerUid = q.ownerUid;
  if (q.orderId) f.orderId = q.orderId;
  if (q.status) f.status = q.status;
  if (q.stage) f.stage = q.stage;
  if (q.open) f.status = { $ne: 'Done' };
  if (q.from || q.to) { f.plannedEnd = {}; if (q.from) f.plannedEnd.$gte = new Date(q.from); if (q.to) f.plannedEnd.$lte = new Date(`${q.to}T23:59:59`); }
  const rows = await TnaTask.find(f).sort('plannedEnd seq').limit(Math.min(+q.size || 500, 2000));
  let items = rows.map((t) => present(t, req.user, amberDays));
  if (q.rag) items = items.filter((t) => t.rag === q.rag);
  return { items, total: items.length };
};
const amber = async () => { const s = await settings(); return { amberDays: s.tnaAmberDays || 3 }; };

/** Replan / reassign (FR-PRI-3): a date or priority change needs a reason and is kept forever. */
const update = async (req, id, body) => {
  const t = await TnaTask.findById(id);
  if (!t) throw ApiError.notFound('TNA task not found');
  const before = t.toObject();
  const datesChange = (body.plannedStart && +new Date(body.plannedStart) !== +t.plannedStart) || (body.plannedEnd && +new Date(body.plannedEnd) !== +t.plannedEnd);
  const prioChange = body.priority && body.priority !== t.priority;
  if ((datesChange || prioChange) && !(hasFlag(req.user, 'tna.edit') || hasModule(req.user, 'tna'))) throw ApiError.forbidden('Replanning needs the TNA module or the tna.edit flag');
  if ((datesChange || prioChange) && !(body.reason && String(body.reason).trim().length >= 3)) throw ApiError.badRequest('A reason is required to replan a date or priority');
  if (body.plannedStart) t.plannedStart = startOfDay(new Date(body.plannedStart));
  if (body.plannedEnd) t.plannedEnd = startOfDay(new Date(body.plannedEnd));
  if (t.plannedEnd < t.plannedStart) t.plannedEnd = t.plannedStart;
  if (body.priority) t.priority = body.priority;
  if (body.ownerUid !== undefined) {
    const u = body.ownerUid ? await User.findOne({ uid: body.ownerUid }) : null;
    t.ownerUid = u ? u.uid : ''; t.ownerName = u ? u.name : '';
  }
  if (body.remark !== undefined) t.remark = body.remark;
  if (body.status && ['Pending', 'In Progress'].includes(body.status)) { t.status = body.status; if (body.status === 'In Progress' && !t.actualStart) t.actualStart = new Date(); }
  if (datesChange || prioChange) {
    t.replanCount += 1;
    t.replans.push({ by: req.user.name, reason: body.reason, from: { plannedStart: before.plannedStart, plannedEnd: before.plannedEnd, priority: before.priority },
      to: { plannedStart: t.plannedStart, plannedEnd: t.plannedEnd, priority: t.priority } });
    await Order.updateOne({ _id: t.orderId }, { $push: { activity: { by: req.user.name, text: `TNA replanned: ${t.activity} → ${t.plannedEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} (${t.priority}) · ${body.reason}` } } });
  }
  await t.save();
  audit.record(req, 'tna.update', `TnaTask:${t.orderNo}/${t.key || t.activity}`, before, t.toObject());
  return present(t, req.user, (await amber()).amberDays);
};

const complete = async (req, id, body = {}) => {
  const t = await TnaTask.findById(id);
  if (!t) throw ApiError.notFound('TNA task not found');
  t.status = 'Done'; t.actualEnd = body.actualEnd ? new Date(body.actualEnd) : new Date(); t.actualStart = t.actualStart || t.actualEnd;
  if (body.remark) t.remark = body.remark;
  await t.save();
  audit.record(req, 'tna.complete', `TnaTask:${t.orderNo}/${t.key || t.activity}`, null, { actualEnd: t.actualEnd, remark: t.remark });
  return present(t, req.user, (await amber()).amberDays);
};
const reopen = async (req, id) => {
  const t = await TnaTask.findById(id);
  if (!t) throw ApiError.notFound('TNA task not found');
  t.status = 'In Progress'; t.actualEnd = undefined;
  await t.save();
  audit.record(req, 'tna.reopen', `TnaTask:${t.orderNo}/${t.key || t.activity}`);
  return present(t, req.user, (await amber()).amberDays);
};

/** Order-level TNA: tasks + health (= worst open task) + stage roll-up. */
const forOrder = async (req, orderId) => {
  const { amberDays } = await amber();
  const tasks = (await TnaTask.find({ orderId }).sort('seq plannedEnd')).map((t) => present(t, req.user, amberDays));
  const names = await stageNames();
  const order = await Order.findById(orderId);
  const live = order ? await require('./live').liveStages(order, names, req.user) : {};
  const r = rollup(tasks, names);
  return { tasks, ...r, stages: r.stages.map((s) => ({ ...s, live: live[s.stage] || null })) };
};
/** Stage roll-up in pipeline order. Stages that were removed from Settings but still carry tasks are appended so nothing disappears. */
const rollup = (tasks, names = DEFAULT_STAGES.map((s) => s.name)) => {
  const open = tasks.filter((t) => t.status !== 'Done');
  const order = [...names, ...tasks.map((t) => t.stage).filter((s) => s && !names.includes(s))].filter((s, i, a) => a.indexOf(s) === i);
  const stages = order.map((stage) => {
    const st = tasks.filter((t) => t.stage === stage);
    const rag = worst(st.map((t) => t.rag).filter((r) => r !== 'done'));
    const next = st.find((t) => t.status !== 'Done');
    return { stage, unlisted: !names.includes(stage), total: st.length, done: st.filter((t) => t.status === 'Done').length, rag: st.length && st.every((t) => t.status === 'Done') ? 'done' : rag,
      next: next ? { activity: next.activity, plannedEnd: next.plannedEnd, rag: next.rag } : null,
      actualEnd: st.length && st.every((t) => t.status === 'Done') ? st.reduce((a, t) => (t.actualEnd > a ? t.actualEnd : a), st[0].actualEnd) : null };
  });
  return {
    health: worst(open.map((t) => t.rag)), total: tasks.length, done: tasks.length - open.length,
    pct: tasks.length ? Math.round((tasks.length - open.length) * 100 / tasks.length) : 0,
    red: open.filter((t) => t.rag === 'red').length, amber: open.filter((t) => t.rag === 'amber').length, replanned: tasks.filter((t) => t.replanned).length, stages,
  };
};

/** Buyer-wise TNA board (FR-19.5a / C4): buyers → orders → stage grid. */
const board = async (req) => {
  const { amberDays } = await amber();
  const orders = await Order.find({ status: 'Open' }).sort('shipDate');
  const tasks = await TnaTask.find({ orderId: { $in: orders.map((o) => o._id) } }).sort('seq');
  const names = await stageNames();
  const byOrder = {};
  tasks.forEach((t) => { (byOrder[String(t.orderId)] = byOrder[String(t.orderId)] || []).push(present(t, req.user, amberDays)); });
  const groups = {};
  const { liveStages } = require('./live');
  const media = await require('../orders/orders.service').photosOf(orders);
  for (const o of orders) {
    const name = buyerLabel(req.user, o.buyerBrand, o.buyerAlias);
    const ts = byOrder[String(o._id)] || [];
    const live = await liveStages(o, names, req.user);   // ponytail: N orders × a few queries each — fine for tens of open orders
    const r = rollup(ts, names);
    (groups[name] = groups[name] || { buyer: name, buyerId: o.buyerId, orders: [] }).orders.push({
      orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, description: o.description, qty: o.qty, shipDate: o.shipDate, priority: o.priority, stage: o.stage,
      progress: o.progress, hasTna: ts.length > 0, buyerName: name, photo: (media[String(o._id)] || {}).photos?.[0] || null, ...r, stages: r.stages.map((s) => ({ ...s, live: live[s.stage] || null })),
      liveNow: Object.entries(live).filter(([, v]) => v.state === 'now' || v.state === 'blocked').map(([k]) => k),
    });
  }
  const out = Object.values(groups).map((g) => ({ ...g, health: worst(g.orders.map((o) => o.health).filter((h) => h !== 'none' && h !== 'done')) }));
  return { buyers: out, stages: names };
};

const summary = async (req) => {
  const { amberDays } = await amber();
  const open = (await TnaTask.find({ status: { $ne: 'Done' } })).map((t) => present(t, req.user, amberDays));
  const today = startOfDay().getTime();
  return {
    red: open.filter((t) => t.rag === 'red').length, amber: open.filter((t) => t.rag === 'amber').length, green: open.filter((t) => t.rag === 'green').length,
    dueToday: open.filter((t) => startOfDay(t.plannedEnd).getTime() === today).length,
    mine: open.filter((t) => t.ownerUid === req.user.uid).length, mineRed: open.filter((t) => t.ownerUid === req.user.uid && t.rag === 'red').length,
    ordersWithTna: (await TnaTask.distinct('orderId')).length, amberDays,
  };
};

/* ---------- pipeline stages (TNA → Stages) ---------- */
const getStages = async () => {
  const cfg = await stagesCfg();
  const counts = await TnaTask.aggregate([{ $group: { _id: '$stage', tasks: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 0, 1] } } } }]);
  const byName = Object.fromEntries(counts.map((c) => [c._id, c]));
  const tpl = await TnaTemplate.find().select('items.stage');
  const tplCount = {}; tpl.forEach((t) => t.items.forEach((it) => { tplCount[it.stage] = (tplCount[it.stage] || 0) + 1; }));
  const stages = cfg.map((s) => ({ ...s, tasks: byName[s.name]?.tasks || 0, open: byName[s.name]?.open || 0, templateItems: tplCount[s.name] || 0 }));
  const unlisted = Object.keys({ ...byName, ...tplCount }).filter((n) => n && !cfg.some((s) => s.name === n)).map((n) => ({ name: n, tasks: byName[n]?.tasks || 0, open: byName[n]?.open || 0, templateItems: tplCount[n] || 0 }));
  return { stages, unlisted, defaults: DEFAULT_STAGES };
};
/**
 * Replace the pipeline. body = { stages: [{ name, portal }], renames: [{ from, to }], moves: [{ from, to }] }
 *  renames — an existing stage got a new name: tasks + template items follow it.
 *  moves   — a stage was removed: its tasks + template items go to another stage.
 */
const setStages = async (req, body = {}) => {
  const before = await stagesCfg();
  const next = cleanStages(body.stages, before);
  const names = next.map((s) => s.name);
  const norm = (v) => String(v || '').trim().replace(/\s+/g, ' ');
  const pairs = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object').map((x) => [norm(x.from), norm(x.to)]).filter(([from, to]) => from && to && from !== to);
  const changes = [];
  const renames = pairs(body.renames), moves = pairs(body.moves);
  // a name in the new list is "still live" unless it is produced by a rename (chain: Packing→Inspection, Inspection→Final Inspection)
  const producedByRename = new Set(renames.map(([, to]) => to));
  const stillLive = (name) => names.includes(name) && !producedByRename.has(name);
  for (const [from, to] of renames) {
    if (!names.includes(to)) throw ApiError.badRequest(`Cannot rename "${from}" to "${to}" — "${to}" is not in the new pipeline`);
    if (stillLive(from)) throw ApiError.badRequest(`Cannot rename "${from}" — it is still in the pipeline (remove it and move its activities instead)`);
    changes.push({ from, to, kind: 'rename' });
  }
  for (const [from, to] of moves) {
    if (!names.includes(to)) throw ApiError.badRequest(`Cannot move "${from}" into "${to}" — "${to}" is not in the new pipeline`);
    if (stillLive(from)) throw ApiError.badRequest(`"${from}" is still in the pipeline — remove it before moving its activities`);
    changes.push({ from, to, kind: 'move' });
  }
  const dupFrom = changes.map((c) => c.from).find((f, i, a) => a.indexOf(f) !== i);
  if (dupFrom) throw ApiError.badRequest(`"${dupFrom}" is listed twice in renames / moves`);
  // One pass keyed on the ORIGINAL stage, so chained renames (Packing→Inspection, Inspection→Final Inspection) and swaps don't re-match rows already moved.
  const to = new Map(changes.map((c) => [c.from, c.to]));
  const froms = [...to.keys()];
  let tasksTouched = 0, itemsTouched = 0;
  if (froms.length) {
    tasksTouched = (await TnaTask.updateMany({ stage: { $in: froms } }, [{ $set: { stage: { $switch: { branches: froms.map((f) => ({ case: { $eq: ['$stage', f] }, then: to.get(f) })), default: '$stage' } } } }])).modifiedCount;
    for (const t of await TnaTemplate.find({ 'items.stage': { $in: froms } })) { t.items.forEach((it) => { if (to.has(it.stage)) { it.stage = to.get(it.stage); itemsTouched += 1; } }); await t.save(); }
  }
  const doc = await require('../settings/settings.routes').getCompany();
  doc.set('tnaStages', next); await doc.save();
  audit.record(req, 'tna.stages', 'Setting:tnaStages', { stages: before }, { stages: next, changes, tasksTouched, itemsTouched });
  log.info(`TNA stages set · ${names.join(' → ')} · ${changes.length} change(s) · ${tasksTouched} tasks · ${itemsTouched} template items · by ${req.user.uid}`);
  return { ...(await getStages()), tasksTouched, itemsTouched };
};

module.exports = { present, defaultItems, templateFor, applyTemplate, markEvent, list, update, complete, reopen, forOrder, rollup, board, summary, worst, stagesCfg, stageNames, getStages, setStages };
