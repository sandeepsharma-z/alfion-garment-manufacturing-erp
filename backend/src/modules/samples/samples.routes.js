const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const crudRoutes = require('../../common/utils/crud-routes');
const svc = require('./samples.service');
const Sample = require('./sample.model');
const orders = require('../orders/orders.service');

router.use(authenticate, requireModule('samples'));

router.get('/meta', (req, res) => res.json({ statuses: Sample.STATUSES, types: Sample.TYPES, catalog: require('../../common/utils/material-catalog').CATALOG }));
router.post('/:id/round', catchAsync(async (req, res) => res.json(await svc.logRound(req, req.params.id, req.body))));
router.post('/:id/spec', catchAsync(async (req, res) => res.json(await svc.addSpec(req, req.params.id, req.body || {}))));
router.get('/:id/spec-data', catchAsync(async (req, res) => res.json(await svc.specData(req, req.params.id))));
router.post('/:id/convert', catchAsync(async (req, res) =>
  res.status(201).json(await orders.createFromSample(req, req.params.id, req.body || {}))));
crudRoutes(router, svc);

router.put('/:id/materials', catchAsync(async (req, res) => res.json(await svc.setMaterials(req, req.params.id, req.body || {}))));
router.get('/:id/requirement', catchAsync(async (req, res) => res.json(await svc.requirement(req, req.params.id, req.query))));
router.put('/:id/costing', catchAsync(async (req, res) => res.json(await svc.setCosting(req, req.params.id, req.body || {}))));
router.put('/:id/tracking', catchAsync(async (req, res) => res.json(await svc.setTracking(req, req.params.id, req.body || {}))));
router.get('/:id/dossier', catchAsync(async (req, res) => res.json(await svc.dossier(req, req.params.id))));
router.put('/:id/measurements', catchAsync(async (req, res) => res.json(await svc.setMeasurements(req, req.params.id, req.body || {}))));

module.exports = router;
