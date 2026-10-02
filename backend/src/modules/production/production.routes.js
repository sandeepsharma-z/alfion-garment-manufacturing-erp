const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const svc = require('./production.service');
const { OPS, EXEC } = require('./production.model');

router.use(authenticate, requireModule('production'));

router.get('/meta', (req, res) => res.json({ ops: OPS, exec: EXEC }));
router.get('/board', catchAsync(async (req, res) => res.json(await svc.board(req))));
router.get('/logs', catchAsync(async (req, res) => res.json(await svc.logs(req, req.query))));
router.post('/logs', catchAsync(async (req, res) => res.status(201).json(await svc.addLog(req, req.body || {}, 'manual'))));
router.get('/cutting', catchAsync(async (req, res) => res.json(await svc.cuttingList(req.query))));
router.post('/cutting', catchAsync(async (req, res) => res.status(201).json(await svc.cuttingCreate(req, req.body || {}))));
router.get('/wip', catchAsync(async (req, res) => res.json(await svc.wip(req, req.query))));
router.get('/loading-plan', catchAsync(async (req, res) => res.json(await svc.loadingPlan(req, req.query))));
router.post('/loading-plan', catchAsync(async (req, res) => res.status(201).json(await svc.loadingSave(req, req.body || {}))));
router.delete('/loading-plan/:id', catchAsync(async (req, res) => res.json(await svc.loadingDelete(req, req.params.id))));
router.patch('/ops/:id', catchAsync(async (req, res) => res.json(await svc.planOp(req, req.params.id, req.body || {}))));

module.exports = router;
