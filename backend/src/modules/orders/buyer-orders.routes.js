const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const crudRoutes = require('../../common/utils/crud-routes');
const svc = require('./buyer-orders.service');

router.use(authenticate, requireModule('orders'));
router.get('/:id/detail', catchAsync(async (req, res) => res.json(await svc.detail(req, req.params.id))));
crudRoutes(router, svc);

module.exports = router;
