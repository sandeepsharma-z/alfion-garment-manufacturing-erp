const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { plain } = require('../../common/utils/mask');
const svc = require('./gate.service');
const Gate = require('./gate.model');

router.use(authenticate, requireModule('gate'));

router.get('/meta', (req, res) => res.json({ inspection: Gate.INSPECTION }));
router.get('/pending', catchAsync(async (req, res) => res.json({ items: await svc.pending(req.user) })));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req.user))));
router.get('/', catchAsync(async (req, res) => res.json(await svc.register(req.query))));
router.get('/:id', catchAsync(async (req, res) => {
  const g = await Gate.findById(req.params.id);
  if (!g) return res.status(404).json({ code: 'NOT_FOUND', message: 'Gate entry not found' });
  return res.json(plain(g));
}));
router.post('/', catchAsync(async (req, res) => {
  const out = await svc.receive(req, req.body || {});
  res.status(out.duplicate ? 200 : 201).json(out);
}));

module.exports = router;
