const ApiError = require('../../common/utils/api-error');
const crud = require('../../common/utils/crud');
const { plain, buyerLabel } = require('../../common/utils/mask');
const { hasFlag } = require('../users/roles');
const BuyerOrder = require('./buyer-order.model');
const Buyer = require('../buyers/buyer.model');
const Order = require('./order.model');

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR'];
const REVISED = ['currency', 'fxRate', 'terms', 'incoterm', 'latestShipment', 'deliveryDate', 'salesMonth', 'poNo'];
const fmtV = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === undefined || v === null ? '' : String(v));

const present = (doc, user) => {
  const b = plain(doc);
  b.buyerName = buyerLabel(user, b.buyerBrand, b.buyerAlias);
  if (!hasFlag(user, 'buyer.confidential')) delete b.buyerBrand;
  if (!hasFlag(user, 'rates.view')) delete b.fxRate;
  return b;
};

const clean = async (body, req, doc) => {
  const { revision, revisions, revisionReason, buyerBrand, buyerAlias, createdBy, ...rest } = body;
  if (rest.buyerId) {
    const b = await Buyer.findById(rest.buyerId);
    if (!b) throw ApiError.badRequest('Buyer not found');
    rest.buyerBrand = b.brand; rest.buyerAlias = b.alias;
  }
  if (rest.currency && !CURRENCIES.includes(rest.currency)) throw ApiError.badRequest('Currency must be one of ' + CURRENCIES.join(', '));
  ['date', 'latestShipment', 'deliveryDate'].forEach((k) => { if (rest[k] !== undefined) rest[k] = rest[k] ? new Date(rest[k]) : undefined; });
  if (rest.fxRate !== undefined) rest.fxRate = Math.max(+rest.fxRate || 0, 0);
  if (doc) {
    const changes = REVISED.filter((k) => rest[k] !== undefined && fmtV(rest[k]) !== fmtV(doc[k])).map((k) => ({ field: k, from: fmtV(doc[k]), to: fmtV(rest[k]) }));
    if (changes.length) {
      rest.revision = (doc.revision || 0) + 1;
      rest.revisions = [...doc.revisions.map((r) => r.toObject()), { no: rest.revision, by: req.user.name, reason: String(revisionReason || '').trim(), changes }];
    }
  } else { rest.createdBy = req.user.uid; rest.status = 'Open'; }
  return rest;
};

const base = crud(BuyerOrder, {
  label: 'buyer order',
  form: 'buyer_orders',
  search: ['poNo', 'buyerBrand', 'buyerAlias', 'season', 'salesMonth'],
  filters: ['status', 'buyerId'],
  sort: '-date -createdAt',
  present,
  beforeCreate: async (body, req) => {
    const data = await clean(body, req);
    if (!data.buyerId) throw ApiError.badRequest('Buyer is required');
    if (await BuyerOrder.findOne({ buyerId: data.buyerId, poNo: data.poNo })) throw ApiError.conflict(`Buyer order ${data.poNo} already exists for this buyer`);
    return data;
  },
  beforeUpdate: async (body, req, doc) => clean(body, req, doc),
});

/** Header + its style lines (orders) with shipping balances. */
const detail = async (req, id) => {
  const bo = await BuyerOrder.findById(id);
  if (!bo) throw ApiError.notFound('Buyer order not found');
  const ordersSvc = require('./orders.service');
  const lines = await Order.find({ buyerOrderId: bo._id }).sort('createdAt');
  const rows = await require('../dispatch/dispatch.service').shippingTrack(lines, req.user);
  const items = rows.map((r, i) => ({ ...r, order: ordersSvc.present(lines[i], req.user) }));
  const canRate = hasFlag(req.user, 'rates.view');
  return {
    buyerOrder: present(bo, req.user), lines: items,
    totals: { qty: lines.reduce((a, o) => a + o.qty, 0), shipped: rows.reduce((a, r) => a + r.shippedQty, 0), balance: rows.reduce((a, r) => a + r.balanceQty, 0),
      valueFx: canRate ? Math.round(lines.reduce((a, o) => a + (o.unitPrice || 0) * o.qty, 0) * 100) / 100 : undefined, value: canRate ? Math.round(lines.reduce((a, o) => a + (o.fobRate || 0) * o.qty, 0)) : undefined },
  };
};

/** Lines summary for the list page (count / qty / balance per header) */
const list = async (req) => {
  const r = await base.list(req);
  const ids = r.items.map((b) => new (require('mongoose').Types.ObjectId)(String(b.id)));
  const agg = await Order.aggregate([{ $match: { buyerOrderId: { $in: ids } } }, { $group: { _id: '$buyerOrderId', lines: { $sum: 1 }, qty: { $sum: '$qty' }, styles: { $addToSet: '$styleNo' } } }]);
  const by = Object.fromEntries(agg.map((a) => [String(a._id), a]));
  return { ...r, items: r.items.map((b) => { const a = by[String(b.id)] || { lines: 0, qty: 0, styles: [] }; return { ...b, lines: a.lines, qty: a.qty, styles: a.styles }; }) };
};

module.exports = { ...base, list, present, detail, CURRENCIES };
