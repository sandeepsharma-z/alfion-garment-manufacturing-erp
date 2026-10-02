const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const crudRoutes = require('../../common/utils/crud-routes');
const svc = require('./jobwork.service');
const JobWork = require('./jobwork.model');
const Vendor = require('../vendors/vendor.model');

router.use(authenticate, requireModule('jobwork'));

router.get('/meta', (req, res) => res.json({ processes: Vendor.PROCESSES, statuses: JobWork.STATUSES, ops: JobWork.OPS }));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req))));
router.post('/issue', catchAsync(async (req, res) => res.status(201).json(await svc.issue(req, req.body || {}))));
router.get('/:id/challan-data', catchAsync(async (req, res) => res.json(await svc.challanData(req, req.params.id))));
router.post('/:id/cancel', catchAsync(async (req, res) => res.json(await svc.cancel(req, req.params.id))));
crudRoutes(router, svc);

module.exports = router;
