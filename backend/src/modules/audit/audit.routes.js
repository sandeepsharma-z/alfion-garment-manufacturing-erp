const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const service = require('./audit.service');

router.use(authenticate, requireModule('users'));
router.get('/', catchAsync(async (req, res) => res.json(await service.list(req.query))));

module.exports = router;
