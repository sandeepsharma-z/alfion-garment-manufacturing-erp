const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const service = require('./users.service');

router.use(authenticate, requireModule('users'));

router.get('/meta', (req, res) => res.json(service.meta()));
router.get('/', catchAsync(async (req, res) => res.json(await service.list(req.query))));
router.post('/', catchAsync(async (req, res) => res.status(201).json(await service.create(req, req.body))));
router.patch('/:id', catchAsync(async (req, res) => res.json(await service.update(req, req.params.id, req.body))));
router.post('/:id/toggle-status', catchAsync(async (req, res) => res.json(await service.toggleStatus(req, req.params.id))));

module.exports = router;
