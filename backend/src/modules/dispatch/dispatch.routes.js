const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const svc = require('./dispatch.service');
const Dispatch = require('./dispatch.model');

router.use(authenticate, requireModule('dispatch'));

router.get('/meta', catchAsync(async (req, res) => { const c = (await require('../settings/settings.routes').getCompany()).toObject(); res.json({ docTypes: Dispatch.DOC_TYPES, generated: Dispatch.GENERATED, statuses: Dispatch.STATUSES, track: Dispatch.TRACK,
  incoterms: Dispatch.INCOTERMS, ports: ['Nhava Sheva (INNSA1)', 'Mundra (INMUN1)', 'ICD Tughlakabad (INTKD6)', 'Delhi Air Cargo (INDEL4)', 'Chennai (INMAA1)'], igstPct: c.igstPct || 0, fxRate: c.fxRate || 1, defaultCurrency: c.defaultCurrency || 'USD', formatNos: c.formatNos || {} }); }));
router.get('/summary', catchAsync(async (req, res) => res.json(await svc.summary(req))));
router.get('/', catchAsync(async (req, res) => res.json(await svc.list(req, req.query))));
router.get('/:id', catchAsync(async (req, res) => { const d = await Dispatch.findById(req.params.id); if (!d) throw ApiError.notFound('Shipment not found'); res.json(svc.present(d, req.user)); }));
router.get('/:id/doc-data/:type', catchAsync(async (req, res) => res.json(await svc.docData(req, req.params.id, req.params.type))));
router.post('/', catchAsync(async (req, res) => res.status(201).json(await svc.create(req, req.body || {}))));
router.patch('/:id', catchAsync(async (req, res) => res.json(await svc.update(req, req.params.id, req.body || {}))));
router.post('/:id/docs/:type/:action', catchAsync(async (req, res) => res.json(await svc.docAction(req, req.params.id, req.params.type, req.params.action, req.body || {}))));
router.post('/:id/track', catchAsync(async (req, res) => res.json(await svc.track(req, req.params.id, req.body || {}))));
router.put('/:id/boxes', catchAsync(async (req, res) => res.json(await svc.setBoxes(req, req.params.id, req.body || {}))));
router.post('/:id/boxes/auto', catchAsync(async (req, res) => res.json(await svc.autoBoxes(req, req.params.id, req.body || {}))));

module.exports = router;
