const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const svc = require('./payables.service');

/* Money out — job-work vendors and material suppliers. Lives with the Vendors module; amounts are masked without the rate flags. */
router.use(authenticate, requireModule('vendors'));

router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req))));
router.get('/parties', catchAsync(async (req, res) => res.json(await svc.parties(req, req.query.kind === 'supplier' ? 'supplier' : 'vendor'))));
router.get('/:kind/:id', catchAsync(async (req, res) => res.json(await svc.ledger(req, req.params.kind === 'supplier' ? 'supplier' : 'vendor', req.params.id))));
router.post('/pay', catchAsync(async (req, res) => res.status(201).json(await svc.pay(req, req.body || {}))));
router.delete('/payment/:id', catchAsync(async (req, res) => res.json(await svc.remove(req, req.params.id))));

module.exports = router;
