const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate } = require('../../common/middleware/auth');
const svc = require('./alerts.service');

/* every signed-in user has an Alert Center (their assigned alerts); admins can see all */
router.use(authenticate);
router.get('/', catchAsync(async (req, res) => res.json(await svc.list(req, req.query))));
router.get('/summary', catchAsync(async (req, res) => { const l = await svc.list(req, {}); res.json({ total: l.total, red: l.red, amber: l.amber, unacknowledged: l.unacknowledged }); }));
router.post('/recompute', catchAsync(async (req, res) => {
  if (req.user.role !== 'Admin') throw ApiError.forbidden('Only an administrator can force a recompute');
  res.json(await svc.compute());
}));
router.post('/:id/ack', catchAsync(async (req, res) => res.json(await svc.acknowledge(req, req.params.id))));

module.exports = router;
