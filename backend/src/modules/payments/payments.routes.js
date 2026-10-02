const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const svc = require('./payments.service');
const Payment = require('./payment.model');

router.use(authenticate, requireModule('payments'));

router.get('/meta', (req, res) => res.json({ methods: ['LC', 'T/T', 'Advance'], banks: ['HSBC EEFC', 'ICICI Bank', 'SBI Export Cell', 'Axis Bank', 'Kotak'], lcMilestones: Payment.LC_MILESTONES, ttMilestones: Payment.TT_MILESTONES }));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req))));
router.get('/', catchAsync(async (req, res) => res.json(await svc.list(req, req.query))));
router.get('/:id', catchAsync(async (req, res) => { const p = await Payment.findById(req.params.id); if (!p) throw ApiError.notFound('Payment not found'); res.json(svc.present(p, req.user)); }));
router.patch('/:id', catchAsync(async (req, res) => res.json(await svc.update(req, req.params.id, req.body || {}))));
router.post('/:id/receipt', catchAsync(async (req, res) => res.status(201).json(await svc.receipt(req, req.params.id, req.body || {}))));
router.post('/:id/milestone', catchAsync(async (req, res) => res.json(await svc.milestone(req, req.params.id, req.body || {}))));

module.exports = router;
