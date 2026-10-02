const ApiError = require('../../common/utils/api-error');
const { buyerLabel } = require('../../common/utils/mask');
const { hasFlag } = require('../users/roles');
const Order = require('../orders/order.model');
const Buyer = require('../buyers/buyer.model');
const Payment = require('./payment.model');
const { present, statusOf } = require('./payments.service');

/** Money coming IN — the mirror of payables. Order value is ₹ (fobRate × qty), same as the reports. */
const money = (v) => Math.round((+v || 0) * 100) / 100;
const canSee = (u) => hasFlag(u, 'rates.view') || hasFlag(u, 'reports.financial');
const valueOf = (o) => Math.round((o.fobRate || 0) * (o.qty || 0));
const pendingOf = (p) => Math.max(p.amount - p.receivedTotal, 0);
const overdueOf = (p) => pendingOf(p) > 0 && !!p.dueDate && new Date(p.dueDate).getTime() < Date.now();

/** What one buyer's orders are worth, what has been invoiced, what came in and what is still to come. */
const totalsOf = (orders, pays) => {
  const live = orders.filter((o) => o.status === 'Open');
  const liveIds = new Set(live.map((o) => String(o._id)));
  const liveValue = live.reduce((a, o) => a + valueOf(o), 0);
  const invoicedLive = pays.filter((p) => liveIds.has(String(p.orderId))).reduce((a, p) => a + p.amount, 0);
  const invoiced = pays.reduce((a, p) => a + p.amount, 0);
  const received = pays.reduce((a, p) => a + p.receivedTotal, 0);
  return {
    orders: orders.length, liveOrders: live.length, liveQty: live.reduce((a, o) => a + (o.qty || 0), 0),
    orderValue: money(orders.reduce((a, o) => a + valueOf(o), 0)), liveValue: money(liveValue),
    invoiced: money(invoiced), received: money(received),
    advance: money(pays.filter((p) => p.receivedTotal > 0 && pendingOf(p) > 0).reduce((a, p) => a + p.receivedTotal, 0)),
    outstanding: money(Math.max(invoiced - received, 0)),
    overdue: money(pays.filter(overdueOf).reduce((a, p) => a + pendingOf(p), 0)),
    toInvoice: money(Math.max(liveValue - invoicedLive, 0)),          // shipped later — not billed yet
    invoices: pays.length, openInvoices: pays.filter((p) => pendingOf(p) > 0).length,
  };
};

const mask = (t, show) => (show ? t : { orders: t.orders, liveOrders: t.liveOrders, liveQty: t.liveQty, invoices: t.invoices, openInvoices: t.openInvoices });

/** One row per buyer for the Buyers page. */
const buyers = async (req) => {
  const show = canSee(req.user);
  const list = await Buyer.find().sort('brand');
  const orders = await Order.find({ buyerId: { $in: list.map((b) => b._id) } }).sort('-createdAt');
  const pays = await Payment.find({ buyerId: { $in: list.map((b) => b._id) } }).sort('-invoiceDate');
  const items = list.map((b) => {
    const mine = orders.filter((o) => String(o.buyerId) === String(b._id));
    const inv = pays.filter((p) => String(p.buyerId) === String(b._id));
    const t = totalsOf(mine, inv);
    const nextShip = mine.filter((o) => o.status === 'Open' && o.shipDate).sort((a, c) => new Date(a.shipDate) - new Date(c.shipDate))[0];
    const lastReceipt = inv.flatMap((p) => p.receipts.map((r) => ({ ...r.toObject ? r.toObject() : r, invoiceNo: p.invoiceNo })))
      .sort((a, c) => new Date(c.creditDate) - new Date(a.creditDate))[0];
    return {
      id: String(b._id), name: buyerLabel(req.user, b.brand, b.alias), alias: b.alias, country: b.country || '', currency: b.currency || 'USD',
      terms: hasFlag(req.user, 'buyer.confidential') ? b.paymentTerms || '' : '', status: b.status,
      nextShip: nextShip ? { orderNo: nextShip.orderNo, date: nextShip.shipDate } : null,
      lastReceipt: lastReceipt ? { invoiceNo: lastReceipt.invoiceNo, date: lastReceipt.creditDate, amount: show ? lastReceipt.amount : undefined } : null,
      money: show, ...mask(t, show),
    };
  });
  return { items: items.sort((a, b2) => (b2.outstanding || 0) - (a.outstanding || 0) || (b2.liveOrders - a.liveOrders)), money: show };
};

/** Headline numbers + who owes us the most. */
const summary = async (req) => {
  const { items, money: show } = await buyers(req);
  const sum = (k) => money(items.reduce((a, x) => a + (x[k] || 0), 0));
  return {
    money: show, buyers: items.length,
    liveOrders: items.reduce((a, x) => a + x.liveOrders, 0), liveQty: items.reduce((a, x) => a + x.liveQty, 0),
    liveValue: sum('liveValue'), invoiced: sum('invoiced'), received: sum('received'), advance: sum('advance'),
    outstanding: sum('outstanding'), overdue: sum('overdue'), toInvoice: sum('toInvoice'),
    openInvoices: items.reduce((a, x) => a + x.openInvoices, 0),
    top: items.filter((x) => (x.outstanding || 0) > 0 || (x.toInvoice || 0) > 0).slice(0, 6)
      .map((x) => ({ id: x.id, name: x.name, outstanding: x.outstanding, overdue: x.overdue, toInvoice: x.toInvoice, openInvoices: x.openInvoices })),
  };
};

/** Full account of one buyer: every order with its value and billing, every invoice with its receipts. */
const account = async (req, id) => {
  const show = canSee(req.user);
  const b = await Buyer.findById(id);
  if (!b) throw ApiError.notFound('Buyer not found');
  const orders = await Order.find({ buyerId: b._id }).sort('-createdAt');
  const pays = await Payment.find({ buyerId: b._id }).sort('-invoiceDate');
  const t = totalsOf(orders, pays);
  return {
    buyer: { id: String(b._id), name: buyerLabel(req.user, b.brand, b.alias), alias: b.alias, country: b.country || '', currency: b.currency || 'USD',
      terms: hasFlag(req.user, 'buyer.confidential') ? b.paymentTerms || '' : '', status: b.status,
      legalName: hasFlag(req.user, 'buyer.confidential') ? b.legalName || '' : '',
      contact: hasFlag(req.user, 'buyer.confidential') && b.contacts && b.contacts[0]
        ? { name: b.contacts[0].name || '', role: b.contacts[0].role || '', email: b.contacts[0].email || '', phone: b.contacts[0].phone || '' } : null },
    orders: orders.map((o) => {
      const inv = pays.filter((p) => String(p.orderId) === String(o._id));
      const invoiced = inv.reduce((a, p) => a + p.amount, 0), received = inv.reduce((a, p) => a + p.receivedTotal, 0);
      return {
        id: String(o._id), orderNo: o.orderNo, styleNo: o.styleNo, description: o.description, qty: o.qty, stage: o.stage, status: o.status,
        shipDate: o.shipDate, buyerPoNo: o.buyerPoNo, currency: o.currency, invoices: inv.length,
        value: show ? money(valueOf(o)) : undefined, valueFx: show ? money((o.unitPrice || 0) * (o.qty || 0)) : undefined,
        invoiced: show ? money(invoiced) : undefined, received: show ? money(received) : undefined,
        balance: show ? money(Math.max(invoiced - received, 0)) : undefined,
        toInvoice: show && o.status === 'Open' ? money(Math.max(valueOf(o) - invoiced, 0)) : undefined,
      };
    }),
    invoices: pays.map((p) => present(p, req.user)),
    totals: mask(t, show), money: show,
  };
};

module.exports = { buyers, summary, account, statusOf };
