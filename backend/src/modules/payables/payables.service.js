const ApiError = require('../../common/utils/api-error');
const { nextSeq, pad } = require('../../common/utils/counters');
const { hasFlag } = require('../users/roles');
const { vendorLabel } = require('../../common/utils/mask');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Payable = require('./payable.model');
const JobWork = require('../jobwork/jobwork.model');
const Po = require('../po/po.model');
const Vendor = require('../vendors/vendor.model');
const Supplier = require('../suppliers/supplier.model');

const log = logger.child({ context: 'PayablesService' });
const DAY = 864e5;
const money = (v) => Math.round((+v || 0) * 100) / 100;
/** Job work is paid on what came back; a purchase order on what the gate received. */
const jwBilled = (j) => money((j.returnedQty || 0) * (j.rate || 0));
const poBilled = (p) => money((p.receivedQty || 0) * (p.rate || 0));
const canSeeMoney = (user, kind) => (kind === 'vendor' ? hasFlag(user, 'vendor.confidential') || hasFlag(user, 'rates.view') : hasFlag(user, 'rates.view'));

/** Every open / settled document of one party with its own paid and balance. */
const docsOf = async (kind, partyId) => {
  const paid = {};
  const vouchers = await Payable.find({ partyKind: kind, partyId });
  vouchers.forEach((v) => v.lines.forEach((l) => { if (l.refId) paid[String(l.refId)] = money((paid[String(l.refId)] || 0) + l.amount); }));
  const rows = [];
  if (kind === 'vendor') {
    const jws = await JobWork.find({ vendorId: partyId, status: { $ne: 'Cancelled' } }).sort('-outDate');
    jws.forEach((j) => {
      const billed = jwBilled(j);
      rows.push({ kind: 'jobwork', id: String(j._id), no: j.challanNo, date: j.outDate, dueDate: j.dueDate,
        what: `${j.processLabel || j.process}${j.itemDesc ? ` · ${j.itemDesc}` : ''}`, orderNo: j.orderNo, styleNo: j.styleNo,
        qty: j.sentQty, doneQty: j.returnedQty, pendingQty: Math.max(j.sentQty - (j.returnedQty || 0), 0), uom: j.uom, rate: j.rate || 0,
        billed, paid: paid[String(j._id)] || 0, balance: money(billed - (paid[String(j._id)] || 0)), status: j.status,
        inProgress: money(Math.max(j.sentQty - (j.returnedQty || 0), 0) * (j.rate || 0)) });
    });
  } else {
    const pos = await Po.find({ supplierId: partyId, status: { $ne: 'Cancelled' } }).sort('-poDate');
    pos.forEach((p) => {
      const billed = poBilled(p);
      rows.push({ kind: 'po', id: String(p._id), no: p.poNo, date: p.poDate, dueDate: p.eta,
        what: `${p.materialCode || ''} ${p.materialName || ''}`.trim(), orderNo: p.orderNo || '', styleNo: '',
        qty: p.orderedQty, doneQty: p.receivedQty, pendingQty: Math.max(p.orderedQty - (p.receivedQty || 0), 0), uom: p.uom, rate: p.rate || 0,
        billed, paid: paid[String(p._id)] || 0, balance: money(billed - (paid[String(p._id)] || 0)), status: p.status,
        inProgress: money(Math.max(p.orderedQty - (p.receivedQty || 0), 0) * (p.rate || 0)) });
    });
  }
  const advances = money(vouchers.reduce((a, v) => a + v.lines.filter((l) => l.kind === 'advance' || !l.refId).reduce((x, l) => x + l.amount, 0), 0));
  return { rows, vouchers, advances };
};

const totalsOf = (rows, advances = 0) => {
  const billed = money(rows.reduce((a, r) => a + r.billed, 0));
  const paid = money(rows.reduce((a, r) => a + r.paid, 0) + advances);
  const outstanding = money(Math.max(billed - money(rows.reduce((a, r) => a + r.paid, 0)) - advances, 0));
  const overdue = money(rows.filter((r) => r.balance > 0 && r.dueDate && new Date(r.dueDate).getTime() < Date.now() - 30 * DAY).reduce((a, r) => a + r.balance, 0));
  return { billed, paid, outstanding, overdue, inProgress: money(rows.reduce((a, r) => a + r.inProgress, 0)), docs: rows.length, openDocs: rows.filter((r) => r.balance > 0).length, advances };
};

/** One row per vendor / supplier: what we gave them, what it is worth, what is paid and what is still owed. */
const parties = async (req, kind) => {
  const show = canSeeMoney(req.user, kind);
  const list = kind === 'vendor' ? await Vendor.find().sort('name') : await Supplier.find().sort('name');
  const out = [];
  for (const p of list) {
    const { rows, vouchers, advances } = await docsOf(kind, p._id);
    const t = totalsOf(rows, advances);
    const last = vouchers.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    out.push({
      id: String(p._id), kind, name: kind === 'vendor' ? vendorLabel(req.user, p.name, p.alias, p.category) : p.name,
      alias: p.alias || '', category: p.category || '', location: p.location || p.city || '', status: p.status,
      docs: t.docs, openDocs: t.openDocs, qty: money(rows.reduce((a, r) => a + r.doneQty, 0)), pendingQty: money(rows.reduce((a, r) => a + r.pendingQty, 0)),
      lastDoc: rows[0] ? { no: rows[0].no, what: rows[0].what, date: rows[0].date } : null,
      lastPayment: last ? { payNo: last.payNo, amount: show ? last.amount : undefined, date: last.date } : null,
      billed: show ? t.billed : undefined, paid: show ? t.paid : undefined, outstanding: show ? t.outstanding : undefined,
      overdue: show ? t.overdue : undefined, inProgress: show ? t.inProgress : undefined, money: show,
    });
  }
  return { items: out.sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0)), money: show };
};

/** Full ledger of one party: every challan / PO with its balance, plus the payment vouchers. */
const ledger = async (req, kind, id) => {
  const show = canSeeMoney(req.user, kind);
  const party = kind === 'vendor' ? await Vendor.findById(id) : await Supplier.findById(id);
  if (!party) throw ApiError.notFound(`${kind === 'vendor' ? 'Vendor' : 'Supplier'} not found`);
  const { rows, vouchers, advances } = await docsOf(kind, party._id);
  const t = totalsOf(rows, advances);
  const mask = (r) => (show ? r : { ...r, rate: undefined, billed: undefined, paid: undefined, balance: undefined, inProgress: undefined });
  return {
    party: { id: String(party._id), kind, name: kind === 'vendor' ? vendorLabel(req.user, party.name, party.alias, party.category) : party.name,
      alias: party.alias || '', category: party.category || '', location: party.location || party.city || '', gstin: show ? party.gstin : undefined,
      terms: party.paymentTerms || party.terms || '', status: party.status },
    docs: rows.map(mask),
    payments: vouchers.sort((a, b) => new Date(b.date) - new Date(a.date)).map((v) => ({ id: String(v._id), payNo: v.payNo, date: v.date, method: v.method,
      reference: v.reference, note: v.note, by: v.by, amount: show ? v.amount : undefined, tdsAmount: show ? v.tdsAmount : undefined,
      lines: v.lines.map((l) => ({ kind: l.kind, refNo: l.refNo, refId: l.refId ? String(l.refId) : '', amount: show ? l.amount : undefined })) })),
    totals: show ? t : { docs: t.docs, openDocs: t.openDocs },
    money: show,
  };
};

/** Headline numbers for the page + the "who is waiting for money" list. */
const summary = async (req) => {
  const v = await parties(req, 'vendor');
  const s = await parties(req, 'supplier');
  const sum = (arr, k) => money(arr.reduce((a, x) => a + (x[k] || 0), 0));
  return {
    money: v.money || s.money,
    vendors: { count: v.items.length, billed: sum(v.items, 'billed'), paid: sum(v.items, 'paid'), outstanding: sum(v.items, 'outstanding'), overdue: sum(v.items, 'overdue'), inProgress: sum(v.items, 'inProgress') },
    suppliers: { count: s.items.length, billed: sum(s.items, 'billed'), paid: sum(s.items, 'paid'), outstanding: sum(s.items, 'outstanding'), overdue: sum(s.items, 'overdue'), inProgress: sum(s.items, 'inProgress') },
    top: [...v.items, ...s.items].filter((x) => (x.outstanding || 0) > 0).sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0)).slice(0, 6)
      .map((x) => ({ id: x.id, kind: x.kind, name: x.name, outstanding: x.outstanding, overdue: x.overdue, openDocs: x.openDocs })),
  };
};

/** Record money paid out. Lines say which challans / POs it settles (an unnamed line is an advance). */
const pay = async (req, body) => {
  const kind = body.partyKind === 'supplier' ? 'supplier' : 'vendor';
  if (!canSeeMoney(req.user, kind)) throw ApiError.forbidden('Recording payments needs the rates / vendor-confidential flag');
  const party = kind === 'vendor' ? await Vendor.findById(body.partyId) : await Supplier.findById(body.partyId);
  if (!party) throw ApiError.badRequest('Party not found');
  const amount = money(body.amount);
  if (amount <= 0) throw ApiError.badRequest('Payment amount must be greater than zero');
  const { rows } = await docsOf(kind, party._id);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  let lines = (Array.isArray(body.lines) ? body.lines : []).filter((l) => l && money(l.amount) > 0).map((l) => {
    const doc = byId[String(l.refId)];
    if (!doc) throw ApiError.badRequest('Unknown document on the payment');
    if (money(l.amount) > doc.balance + 0.01) throw ApiError.badRequest(`${doc.no}: paying ${money(l.amount)} against a balance of ${doc.balance}`);
    return { kind: doc.kind, refId: doc.id, refNo: doc.no, amount: money(l.amount) };
  });
  if (!lines.length) {                                  // nothing picked → settle the oldest balances first
    let left = amount;
    [...rows].filter((r) => r.balance > 0).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((r) => {
      if (left <= 0) return;
      const take = money(Math.min(left, r.balance)); left = money(left - take);
      lines.push({ kind: r.kind, refId: r.id, refNo: r.no, amount: take });
    });
    if (left > 0) lines.push({ kind: 'advance', refNo: 'On account', amount: left });
  }
  const allocated = money(lines.reduce((a, l) => a + l.amount, 0));
  if (Math.abs(allocated - amount) > 0.01) throw ApiError.badRequest(`Allocated ${allocated} but the payment is ${amount}`);
  const v = await Payable.create({
    payNo: `PAY-${pad(await nextSeq('payable'), 4)}`, partyKind: kind, partyId: party._id, partyName: party.name,
    date: body.date ? new Date(body.date) : new Date(), amount, method: body.method || 'Bank transfer',
    reference: String(body.reference || ''), tdsAmount: money(body.tdsAmount), note: String(body.note || ''), lines, by: req.user.name,
  });
  audit.record(req, 'payable.pay', `${kind}:${party.name}`, null, { payNo: v.payNo, amount, lines: lines.length });
  log.info(`${v.payNo} · ${party.name} · ₹${amount} against ${lines.map((l) => l.refNo).join(', ')}`);
  return ledger(req, kind, party._id);
};

const remove = async (req, id) => {
  const v = await Payable.findById(id);
  if (!v) throw ApiError.notFound('Payment not found');
  if (!canSeeMoney(req.user, v.partyKind)) throw ApiError.forbidden('Not allowed');
  await v.deleteOne();
  audit.record(req, 'payable.delete', `${v.partyKind}:${v.partyName}`, v.toObject(), null);
  return ledger(req, v.partyKind, v.partyId);
};

/** Billed / paid / balance per document — job-work challans (vendor) or purchase orders (supplier). */
const balancesOf = async (user, kind, docs) => {
  const ids = docs.map((d) => d._id || d.id);
  const vouchers = await Payable.find({ 'lines.refId': { $in: ids } });
  const paid = {};
  vouchers.forEach((v) => v.lines.forEach((l) => { if (l.refId) paid[String(l.refId)] = money((paid[String(l.refId)] || 0) + l.amount); }));
  const show = canSeeMoney(user, kind);
  const billedOf = kind === 'vendor' ? jwBilled : poBilled;
  const openQty = kind === 'vendor' ? (d) => Math.max(d.sentQty - (d.returnedQty || 0), 0) : (d) => Math.max(d.orderedQty - (d.receivedQty || 0), 0);
  return Object.fromEntries(docs.map((d) => {
    const billed = billedOf(d);
    const p = paid[String(d._id || d.id)] || 0;
    return [String(d._id || d.id), show ? { billed, paid: p, balance: money(billed - p), inProgress: money(openQty(d) * (d.rate || 0)) } : {}];
  }));
};
/** Used by the Job Work page (paid on what came back) and the PO page (paid on what the gate received). */
const jobWorkBalances = (user, jws) => balancesOf(user, 'vendor', jws);
const poBalances = (user, pos) => balancesOf(user, 'supplier', pos);

module.exports = { parties, ledger, summary, pay, remove, jobWorkBalances, poBalances, jwBilled, poBilled };
