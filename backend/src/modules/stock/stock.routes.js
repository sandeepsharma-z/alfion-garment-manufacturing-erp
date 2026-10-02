const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const { plain } = require('../../common/utils/mask');
const svc = require('./stock.service');
const Material = require('../materials/material.model');
const Po = require('../po/po.model');

router.use(authenticate, requireModule('stock'));

/** GET /stock/ledger?materialId=&orderId=&limit= — movement ledger (newest first) */
router.get('/ledger', catchAsync(async (req, res) => {
  const rows = await svc.ledgerFor(req.query);
  res.json({ items: rows.map(plain), total: rows.length });
}));

/** POST /stock/adjust { materialId, qty (signed), reason, godown } */
router.post('/adjust', catchAsync(async (req, res) => res.status(201).json(plain(await svc.adjust(req, req.body || {})))));

/** GET /stock/summary — KPI strip for the Stock page */
router.get('/summary', catchAsync(async (req, res) => {
  const mats = await Material.find({ status: 'Active' });
  const onOrder = await svc.onOrderMap();
  const openPos = await Po.countDocuments({ status: { $in: ['Ordered', 'In Transit', 'Partially Received'] } });
  const attention = mats.filter((m) => m.stockState() !== 'Healthy').length;
  const out = {
    materials: mats.length, attention, openPos,
    onOrderLines: Object.keys(onOrder).length,
    reserved: mats.reduce((a, m) => a + m.reservedQty, 0),
    physicalValue: hasFlag(req.user, 'rates.view') ? Math.round(mats.reduce((a, m) => a + m.physicalQty * (m.rate || 0), 0)) : undefined,
  };
  res.json(out);
}));

module.exports = router;
