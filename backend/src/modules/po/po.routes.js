const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule, requireFlag } = require('../../common/middleware/auth');
const crudRoutes = require('../../common/utils/crud-routes');
const svc = require('./po.service');
const Po = require('./po.model');

router.use(authenticate, requireModule('po'));

router.get('/meta', (req, res) => res.json({ statuses: Po.STATUSES, paymentTerms: ['30 days credit', 'Advance', '50-50', '60 days credit'],
  deliveryAt: ['Unit 1 — Noida', 'Unit 2 — Greater Noida', 'Directly to dyeing vendor', 'Directly to printing vendor'] }));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req))));
router.get('/rate-history', catchAsync(async (req, res) => res.json({ items: await svc.rateHistory(req, req.query.materialId) })));
router.get('/supplier-options', catchAsync(async (req, res) => res.json(await svc.supplierOptions(req, req.query.materialId))));
router.post('/from-plan', catchAsync(async (req, res) => res.status(201).json(await svc.fromPlan(req, req.body || {}))));
router.post('/:id/approve', requireFlag('po.approve'), catchAsync(async (req, res) => res.json(await svc.approve(req, req.params.id))));
router.post('/:id/cancel', catchAsync(async (req, res) => res.json(await svc.cancel(req, req.params.id))));
crudRoutes(router, svc);

module.exports = router;
