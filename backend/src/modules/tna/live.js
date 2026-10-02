/**
 * Live stage state of an order — from what actually happened (material position, production ops, inspections, invoices, payments),
 * not from the planned T&A dates. The board shows this as Done / Now / Upcoming; the T&A tasks stay the calendar underneath.
 * Stage names are configurable, so each name is matched by keyword to one of the nine built-in meanings.
 */
const { ProductionOp } = require('../production/production.model');
const { AqlInspection } = require('../quality/quality.model');
const Dispatch = require('../dispatch/dispatch.model');
const Payment = require('../payments/payment.model');
const stock = require('../stock/stock.service');
const { statusOf: payStatus } = require('../payments/payments.service');

const KEYS = [
  ['samples', /sampl|proto|fit|pp\b|approval/i], ['materials', /material|fabric|trim|sourc|procure|purchase/i], ['cutting', /cut/i], ['stitching', /stitch|sew|assembl/i],
  ['finishing', /finish|wash|press|iron/i], ['packing', /pack/i], ['inspection', /inspect|quality|aql|qc|audit/i], ['dispatch', /dispatch|ship|export|logistic/i], ['payment', /pay|lc\b|realis|receiv|bank/i],
];
const keyOf = (name) => (KEYS.find(([, re]) => re.test(name)) || [''])[0];
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

/** @returns {{ [stageName]: { key, state: 'done'|'now'|'upcoming'|'blocked', detail, pct, link } }} */
const liveStages = async (order, names, user) => {
  const oid = order._id;
  const [ops, finals, dispatches, payments, position] = await Promise.all([
    ProductionOp.find({ orderId: oid }), AqlInspection.find({ orderId: oid, stage: 'Final' }).sort('-date -createdAt').limit(1),
    Dispatch.find({ $or: [{ orderId: oid }, { 'lines.orderId': oid }] }).sort('-invoiceDate'), Payment.find({ orderId: oid }),
    stock.orderPosition(order, user).catch(() => ({ hasBom: false, rows: [] })),
  ]);
  const op = (name) => ops.find((o) => o.op === name);
  const prod = (name, link) => {
    const o = op(name);
    if (!o || !o.plannedQty) return { state: 'upcoming', detail: 'Not planned yet', pct: 0, link };
    const pct = Math.min(Math.round(o.doneQty * 100 / o.plannedQty), 100);
    const where = o.exec === 'Outsourced' ? (o.vendorAlias || 'vendor') : (o.line || '');
    if (o.blocked) return { state: 'blocked', detail: `Blocked — ${o.blockedReason || 'see production'}`, pct, link };
    if (o.doneQty >= o.plannedQty) return { state: 'done', detail: `${fmt(o.doneQty)} / ${fmt(o.plannedQty)} pcs complete`, pct: 100, link };
    if (o.doneQty > 0) return { state: 'now', detail: `${fmt(o.doneQty)} / ${fmt(o.plannedQty)} pcs${where ? ` · ${where}` : ''}`, pct, link };
    return { state: 'upcoming', detail: `0 / ${fmt(o.plannedQty)} pcs${where ? ` · ${where}` : ''}`, pct: 0, link };
  };
  const shortLines = position.rows.filter((r) => r.shortage > 0), onOrder = shortLines.filter((r) => r.toOrder === 0);
  const final = finals[0];
  const shipped = dispatches.filter((d) => (d.tracking || []).some((t) => t.key === 'onboard' && t.done));
  const pay = payments[0];
  const byKey = {
    samples: { state: 'done', detail: `${order.sampleNo || 'Sample'} approved${order.specSheet && order.specSheet.version ? ` · spec v${order.specSheet.version}` : ''}`, pct: 100, link: `/samples?q=${encodeURIComponent(order.sampleNo || order.styleNo)}` },
    materials: !position.hasBom ? { state: 'now', detail: 'No BOM yet — define it in Planning', pct: 0, link: `/planning?style=${order.styleId}&qty=${order.cutQty || order.qty}&order=${oid}` }
      : shortLines.length === 0 ? { state: 'done', detail: `All ${position.rows.length} lines available`, pct: 100, link: `/orders/${oid}` }
      : onOrder.length === shortLines.length ? { state: 'now', detail: `${onOrder.length} line${onOrder.length > 1 ? 's' : ''} on order · awaiting gate`, pct: Math.round((position.rows.length - shortLines.length) * 100 / position.rows.length), link: `/orders/${oid}` }
      : { state: 'now', detail: `${shortLines.length - onOrder.length} line${shortLines.length - onOrder.length > 1 ? 's' : ''} short — raise PO`, pct: Math.round((position.rows.length - shortLines.length) * 100 / position.rows.length), link: `/orders/${oid}` },
    cutting: prod('Cutting', `/production?tab=cutting&order=${oid}&period=all`), stitching: prod('Stitching', `/production?tab=stitching&order=${oid}&period=all`), finishing: prod('Finishing', `/production?tab=finishing&order=${oid}&period=all`), packing: prod('Packing', `/production?tab=packing&order=${oid}&period=all`),
    inspection: !final ? { state: 'upcoming', detail: 'Final AQL not done', pct: 0, link: '/quality?tab=aql' }
      : final.result === 'Pass' ? { state: 'done', detail: `${final.inspNo} · Pass`, pct: 100, link: '/quality?tab=aql' } : { state: 'blocked', detail: `${final.inspNo} · ${final.result} — dispatch blocked`, pct: 50, link: '/quality?tab=aql' },
    dispatch: !dispatches.length ? { state: 'upcoming', detail: 'Not invoiced', pct: 0, link: '/dispatch' }
      : shipped.length ? { state: 'done', detail: `${shipped[0].invoiceNo} · shipped${dispatches.length > 1 ? ` · ${dispatches.length} invoices` : ''}`, pct: 100, link: '/dispatch' }
      : { state: 'now', detail: `${dispatches[0].invoiceNo} · ${(dispatches[0].documents || []).filter((x) => x.status === 'Pending').length} doc(s) pending`, pct: 50, link: '/dispatch' },
    payment: !pay ? { state: 'upcoming', detail: 'No invoice yet', pct: 0, link: '/payments' }
      : payStatus(pay) === 'Received' ? { state: 'done', detail: `${pay.invoiceNo} · realised`, pct: 100, link: '/payments' } : { state: 'now', detail: `${pay.invoiceNo} · ${payStatus(pay)}`, pct: 50, link: '/payments' },
  };
  /* production stages: an unstarted stage after a started one is "upcoming"; the first unstarted stage right after the last done one is "now" (the floor's next job) */
  const seq = ['materials', 'cutting', 'stitching', 'finishing', 'packing', 'inspection', 'dispatch', 'payment'];
  let pointerSet = seq.some((k) => byKey[k].state === 'now' || byKey[k].state === 'blocked');
  if (!pointerSet) { const next = seq.find((k) => byKey[k].state === 'upcoming'); if (next) byKey[next] = { ...byKey[next], state: 'now' }; }
  if (order.status === 'Closed') Object.keys(byKey).forEach((k) => { byKey[k] = { ...byKey[k], state: 'done' }; });
  const out = {};
  names.forEach((n) => { const k = keyOf(n); if (k && byKey[k]) out[n] = { key: k, ...byKey[k] }; });
  return out;
};

module.exports = { liveStages, keyOf };
