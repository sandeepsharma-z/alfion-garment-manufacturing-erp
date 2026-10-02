const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const svc = require('./orders.service');
const Order = require('./order.model');

router.use(authenticate, requireModule('orders'));

router.get('/meta', catchAsync(async (req, res) => { const c = (await require('../settings/settings.routes').getCompany()).toObject(); res.json({ stages: Order.STAGES, sizes: svc.SIZES, currencies: svc.CURRENCIES, sizeSets: c.sizeSets || [], cutExtraPct: c.cutExtraPct ?? 5, defaultCurrency: c.defaultCurrency || 'USD', fxRate: c.fxRate || 1 }); }));
router.get('/shipping-track', catchAsync(async (req, res) => res.json(await svc.shippingTrack(req, req.query))));
router.get('/', catchAsync(async (req, res) => res.json(await svc.list(req))));
router.get('/:id/form-context', catchAsync(async (req, res) => res.json(await svc.formContext(req, req.params.id))));
router.get('/:id/card', catchAsync(async (req, res) => res.json(await svc.card(req, req.params.id))));
router.get('/:id/fabric-wip', catchAsync(async (req, res) => res.json(await svc.fabricWip(req, req.params.id))));
router.get('/:id', catchAsync(async (req, res) => res.json(await svc.detail(req, req.params.id))));
router.patch('/:id', catchAsync(async (req, res) => res.json(await svc.update(req, req.params.id, req.body))));
router.post('/:id/activity', catchAsync(async (req, res) => res.json(await svc.addActivity(req, req.params.id, (req.body || {}).text))));
router.post('/:id/reserve', catchAsync(async (req, res) => res.json(await svc.reserve(req, req.params.id))));
router.post('/:id/release', catchAsync(async (req, res) => res.json(await svc.release(req, req.params.id))));
router.post('/:id/close', catchAsync(async (req, res) => res.json(await svc.close(req, req.params.id))));

module.exports = router;
