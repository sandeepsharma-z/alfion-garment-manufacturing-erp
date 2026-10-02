const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { plain } = require('../../common/utils/mask');
const svc = require('./quality.service');
const { FabricInspection, InlineInspection, AqlInspection, MeasurementInspection, NeedleRecord, BladeRecord } = require('./quality.model');

router.use(authenticate, requireModule('quality'));

const listOf = (Model, sort = '-date -createdAt') => catchAsync(async (req, res) => {
  const f = {};
  ['orderId', 'materialId', 'result', 'stage', 'line', 'hold', 'kind', 'machineNo'].forEach((k) => { if (req.query[k] !== undefined && req.query[k] !== '') f[k] = req.query[k] === 'true' ? true : req.query[k] === 'false' ? false : req.query[k]; });
  const rows = await Model.find(f).sort(sort).limit(Math.min(+req.query.size || 200, 1000));
  res.json({ items: rows.map(plain), total: rows.length });
});

router.get('/meta', catchAsync(async (req, res) => res.json({ defects: await svc.defectMaster(), fabricCategories: svc.FABRIC_CATEGORIES, aqlLevels: ['2.5', '4.0'] })));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary())));
router.get('/rejections', catchAsync(async (req, res) => res.json(await svc.rejections(req, req.query))));
router.get('/aql/plan', (req, res) => res.json(svc.aqlPlan(+req.query.lotSize || 0, req.query.level || '2.5')));

router.get('/fabric', listOf(FabricInspection));
router.post('/fabric', catchAsync(async (req, res) => res.status(201).json(await svc.fabricCreate(req, req.body || {}))));
router.get('/fabric/:id', catchAsync(async (req, res) => { const d = await FabricInspection.findById(req.params.id); if (!d) throw ApiError.notFound('Inspection not found'); res.json(plain(d)); }));
router.patch('/fabric/:id', catchAsync(async (req, res) => res.json(await svc.fabricUpdate(req, req.params.id, req.body || {}))));
router.post('/fabric/:id/release', catchAsync(async (req, res) => res.json(await svc.fabricRelease(req, req.params.id, (req.body || {}).reason))));
router.get('/inline', listOf(InlineInspection));
router.post('/inline', catchAsync(async (req, res) => res.status(201).json(await svc.inlineCreate(req, req.body || {}))));
router.get('/measurements', listOf(MeasurementInspection));
router.post('/measurements', catchAsync(async (req, res) => res.status(201).json(await svc.measurementCreate(req, req.body || {}))));
router.get('/needles', listOf(NeedleRecord));
router.post('/needles', catchAsync(async (req, res) => res.status(201).json(await svc.needleCreate(req, req.body || {}))));
router.get('/blades', listOf(BladeRecord));
router.post('/blades', catchAsync(async (req, res) => res.status(201).json(await svc.bladeCreate(req, req.body || {}))));
router.get('/aql', listOf(AqlInspection));
router.post('/aql', catchAsync(async (req, res) => res.status(201).json(await svc.aqlCreate(req, req.body || {}))));

module.exports = router;
