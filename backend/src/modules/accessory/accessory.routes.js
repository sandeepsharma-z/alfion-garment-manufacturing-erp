const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const { plain, buyerLabel } = require('../../common/utils/mask');
const Material = require('../materials/material.model');
const Order = require('../orders/order.model');
const stock = require('../stock/stock.service');

router.use(authenticate, requireModule('accessory'));

/**
 * GET /accessories/overview — accessory stock + requirement by open order (M-8).
 * Everything derived from the material master, the ledger and the BOM; nothing is typed in.
 */
router.get('/overview', catchAsync(async (req, res) => {
  const showRate = hasFlag(req.user, 'rates.view');
  const onOrder = await stock.onOrderMap();
  const mats = await Material.find({ category: 'Accessory', status: 'Active' }).sort('code');
  const items = mats.map((m) => {
    const o = plain(m);
    o.freeQty = m.physicalQty - m.reservedQty;
    o.stockState = m.stockState();
    o.onOrder = (onOrder[String(m._id)] || { qty: 0 }).qty;
    if (!showRate) delete o.rate;
    return o;
  });
  const orders = await Order.find({ status: 'Open' }).sort('shipDate');
  const byOrder = [];
  for (const o of orders) {
    const pos = await stock.orderPosition(o, req.user);
    const lines = pos.rows.filter((r) => r.category === 'Accessory');
    const short = lines.filter((l) => l.shortage > 0);
    const status = !pos.hasBom || !lines.length ? 'No BOM' : !short.length ? 'Available'
      : short.every((l) => l.toOrder === 0) ? 'On Order' : 'Not Ordered';
    byOrder.push({
      orderId: o._id, orderNo: o.orderNo, styleNo: o.styleNo, qty: o.qty, shipDate: o.shipDate, priority: o.priority,
      buyerName: buyerLabel(req.user, o.buyerBrand, o.buyerAlias), spec: o.accessories, status, lines,
    });
  }
  res.json({
    items, byOrder,
    kpi: {
      skus: items.length,
      short: items.filter((i) => i.stockState !== 'Healthy').length,
      value: showRate ? Math.round(mats.reduce((a, m) => a + m.physicalQty * (m.rate || 0), 0)) : undefined,
      ordersShort: byOrder.filter((b) => b.status === 'Not Ordered').length,
    },
  });
}));

module.exports = router;
