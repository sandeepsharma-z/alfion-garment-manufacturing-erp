const ApiError = require('../../common/utils/api-error');
const { plain, buyerLabel } = require('../../common/utils/mask');
const { hasFlag } = require('../users/roles');
const audit = require('../audit/audit.service');
const logger = require('../../common/logger/logger');
const Payment = require('./payment.model');
const Order = require('../orders/order.model');
const log = logger.child({ context: 'PaymentsService' });

const DAY = 864e5;
const money = (u) => hasFlag(u, 'rates.view') || hasFlag(u, 'reports.financial');
const termsDays = (terms) => { const m = /(\d{2,3})\s*days?/i.exec(terms || ''); return m ? +m[1] : (/sight/i.test(terms || '') ? 7 : 60); };

const statusOf = (p) => {
  const pending = Math.max(p.amount - p.receivedTotal, 0);
  if (p.amount > 0 && pending <= 0) return 'Received';
  if (p.receivedTotal > 0) return 'Partial';
  return 'Awaited';
};
const present = (doc, user) => {
  const p = plain(doc);
  p.buyerName = buyerLabel(user, p.buyerBrand, p.buyerAlias);
  if (!hasFlag(user, 'buyer.confidential')) delete p.buyerBrand;
  p.status = statusOf(p);
  p.pending = Math.max(p.amount - p.receivedTotal, 0);
  p.receivedPct = p.amount ? Math.min(Math.round(p.receivedTotal * 100 / p.amount), 100) : 0;
  p.overdue = p.status !== 'Received' && !!p.dueDate && new Date(p.dueDate).getTime() < Date.now();
  p.displayStatus = p.overdue ? 'Overdue' : p.status;
  const last = p.receipts.length ? p.receipts[p.receipts.length - 1] : null;
  p.realisationDays = p.status === 'Received' && last && p.invoiceDate ? Math.round((new Date(last.creditDate) - new Date(p.invoiceDate)) / DAY) : null;
  p.bankCharges = p.receipts.reduce((a, r) => a + (r.charges || 0), 0);
  if (!money(user)) { delete p.amount; delete p.pending; delete p.receivedTotal; delete p.bankCharges; p.receipts = p.receipts.map((r) => ({ ...r, amount: undefined, fxRate: undefined, charges: undefined })); }
  return p;
};

/** Called by dispatch.create — one tracker per invoice. */
const openForDispatch = async (req, d, order) => {
  const method = d.paymentMethod || 'LC';
  const ms = (method === 'LC' ? Payment.LC_MILESTONES : Payment.TT_MILESTONES).map((m) => ({ ...m, done: false }));
  const p = await Payment.create({
    dispatchId: d._id, invoiceNo: d.invoiceNo, orderId: order._id, orderNo: order.orderNo, buyerId: order.buyerId, buyerBrand: order.buyerBrand, buyerAlias: order.buyerAlias,
    invoiceDate: d.invoiceDate, amount: d.invoiceValue, currency: d.currency, method, terms: d.paymentTerms || order.paymentTerms || '',
    dueDate: new Date(new Date(d.invoiceDate).getTime() + termsDays(d.paymentTerms || order.paymentTerms) * DAY), milestones: ms,
  });
  log.info(`payment tracker · ${p.invoiceNo} · ${method} · due ${p.dueDate.toISOString().slice(0, 10)}`);
  return p;
};

const update = async (req, id, b) => {
  const p = await Payment.findById(id);
  if (!p) throw ApiError.notFound('Payment not found');
  const before = p.toObject();
  ['bank', 'terms', 'reference', 'remarks'].forEach((k) => { if (b[k] !== undefined) p.set(k, b[k]); });
  if (b.method && ['LC', 'T/T', 'Advance'].includes(b.method) && b.method !== p.method) {
    p.method = b.method; p.milestones = (b.method === 'LC' ? Payment.LC_MILESTONES : Payment.TT_MILESTONES).map((m) => ({ ...m, done: false }));
  }
  if (b.dueDate) p.dueDate = new Date(b.dueDate);
  if (b.amount !== undefined && money(req.user)) p.amount = Math.round(+b.amount || 0);
  await p.save();
  audit.record(req, 'payment.update', `Payment:${p.invoiceNo}`, before, p.toObject());
  return present(p, req.user);
};

/** Record a receipt (C10): amount ≤ pending (hard), FX rate, BRC / FIRC reference, charges. */
const receipt = async (req, id, b) => {
  if (!money(req.user)) throw ApiError.forbidden('Recording receipts needs the rates / financial flag');
  const p = await Payment.findById(id);
  if (!p) throw ApiError.notFound('Payment not found');
  const amount = Math.round(+b.amount || 0);
  if (amount <= 0) throw ApiError.badRequest('Amount received must be greater than zero');
  const pending = Math.max(p.amount - p.receivedTotal, 0);
  if (amount > pending) throw ApiError.badRequest(`Cannot record ₹${amount.toLocaleString('en-IN')}. Only ₹${pending.toLocaleString('en-IN')} is pending against ${p.invoiceNo}.`, 'OVER_RECEIPT');
  p.receipts.push({ amount, fxRate: +b.fxRate || 0, bank: b.bank || p.bank || '', creditDate: b.creditDate ? new Date(b.creditDate) : new Date(), reference: b.reference || '', charges: +b.charges || 0, remarks: b.remarks || '', by: req.user.name });
  p.receivedTotal += amount;
  if (b.bank && !p.bank) p.bank = b.bank;
  const done = p.receivedTotal >= p.amount;
  const credited = p.milestones.find((m) => m.key === 'credited');
  if (done && credited) { credited.done = true; credited.at = new Date(b.creditDate || Date.now()); credited.detail = `₹${p.receivedTotal.toLocaleString('en-IN')} credited`; p.closedAt = credited.at; }
  if (!done && p.method === 'T/T') { const adv = p.milestones.find((m) => m.key === 'advance'); if (adv && !adv.done) { adv.done = true; adv.at = new Date(); adv.detail = `₹${amount.toLocaleString('en-IN')}`; } }
  await p.save();
  const tna = require('../tna/tna.service');
  if (done) {
    await tna.markEvent(p.orderId, 'payment', credited ? credited.at : new Date(), p.invoiceNo);
    await Order.updateOne({ _id: p.orderId, status: 'Open' }, { $set: { stage: 'Payment' } });
  }
  await Order.updateOne({ _id: p.orderId }, { $push: { activity: { by: req.user.name, text: `Receipt ₹${amount.toLocaleString('en-IN')} against ${p.invoiceNo} (${p.method})${b.reference ? ' · ' + b.reference : ''}${done ? ' · fully realised — order ready for closure' : ` · ₹${Math.max(p.amount - p.receivedTotal, 0).toLocaleString('en-IN')} pending`}` } } });
  audit.record(req, 'payment.receipt', `Payment:${p.invoiceNo}`, null, { amount, fxRate: b.fxRate, reference: b.reference, charges: b.charges, done });
  log.info(`${p.invoiceNo} +₹${amount} · ${p.receivedTotal}/${p.amount} · ${statusOf(p)}`);
  return present(p, req.user);
};

const milestone = async (req, id, b) => {
  const p = await Payment.findById(id);
  if (!p) throw ApiError.notFound('Payment not found');
  const m = p.milestones.find((x) => x.key === b.key);
  if (!m) throw ApiError.badRequest('Unknown milestone');
  m.done = b.done !== false; m.at = b.at ? new Date(b.at) : new Date(); m.detail = b.detail || m.detail || '';
  if (b.key === 'lc_received' && b.reference) p.reference = b.reference;
  if (b.key === 'lc_received' && b.bank) p.bank = b.bank;
  await p.save();
  if (m.done && ['negotiated', 'shipped_docs'].includes(b.key)) await require('../tna/tna.service').markEvent(p.orderId, 'docs_bank', m.at, p.invoiceNo);
  audit.record(req, 'payment.milestone', `Payment:${p.invoiceNo}`, null, { key: b.key, detail: m.detail });
  return present(p, req.user);
};

const list = async (req, q = {}) => {
  const f = {};
  if (q.orderId) f.orderId = q.orderId;
  if (q.method) f.method = q.method;
  const rows = await Payment.find(f).sort('dueDate').limit(500);
  let items = rows.map((r) => present(r, req.user));
  if (q.status) items = items.filter((x) => (q.status === 'Overdue' ? x.overdue : x.status === q.status));
  return { items, total: items.length };
};
const forOrder = async (orderId, user) => (await Payment.find({ orderId }).sort('-invoiceDate')).map((p) => present(p, user));

const summary = async (req) => {
  const rows = (await Payment.find()).map((p) => ({ ...p.toObject(), status: statusOf(p) }));
  const fyStart = new Date(new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0), 3, 1);
  const receipts = rows.flatMap((p) => p.receipts.map((r) => ({ ...r, method: p.method })));
  const receivedFY = receipts.filter((r) => new Date(r.creditDate) >= fyStart).reduce((a, r) => a + r.amount, 0);
  const outstanding = rows.reduce((a, p) => a + Math.max(p.amount - p.receivedTotal, 0), 0);
  const realised = rows.filter((p) => p.status === 'Received' && p.receipts.length && p.invoiceDate);
  const days = (arr) => (arr.length ? Math.round(arr.reduce((a, p) => a + (new Date(p.receipts[p.receipts.length - 1].creditDate) - new Date(p.invoiceDate)) / DAY, 0) / arr.length) : null);
  const byMethod = {};
  receipts.forEach((r) => { byMethod[r.method] = (byMethod[r.method] || 0) + r.amount; });
  const m = money(req.user);
  return {
    receivedFY: m ? receivedFY : undefined, outstanding: m ? outstanding : undefined, openInvoices: rows.filter((p) => p.status !== 'Received').length,
    overdue: rows.filter((p) => p.status !== 'Received' && p.dueDate && p.dueDate < new Date()).length,
    lcUnderNegotiation: rows.filter((p) => p.method === 'LC' && p.status !== 'Received' && p.milestones.some((x) => x.key === 'shipped_docs' && x.done) && !p.milestones.some((x) => x.key === 'negotiated' && x.done)).length,
    lcOpen: rows.filter((p) => p.method === 'LC' && p.status !== 'Received').map((p) => p.reference || p.invoiceNo),
    avgRealisationDays: days(realised), lcDays: days(realised.filter((p) => p.method === 'LC')), ttDays: days(realised.filter((p) => p.method !== 'LC')),
    byMethod: m ? { ...byMethod, Pending: outstanding } : undefined,
  };
};

module.exports = { present, statusOf, openForDispatch, update, receipt, milestone, list, forOrder, summary };
