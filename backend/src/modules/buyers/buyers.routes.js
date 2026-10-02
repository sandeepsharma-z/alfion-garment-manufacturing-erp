const router = require('express').Router();
const { authenticate, requireModule, requireFlag } = require('../../common/middleware/auth');
const crud = require('../../common/utils/crud');
const crudRoutes = require('../../common/utils/crud-routes');
const catchAsync = require('../../common/utils/catch-async');
const receivables = require('../payments/receivables.service');
const { presentBuyer } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const Buyer = require('./buyer.model');

const svc = crud(Buyer, {
  label: 'buyer',
  form: 'buyers',
  search: ['brand', 'legalName', 'country', 'alias'],
  filters: ['status', 'country'],
  sort: 'brand',
  present: presentBuyer,
  beforeCreate: async (body) => ({ ...body, alias: `B-${pad(await nextSeq('buyer'), 2)}` }),
  beforeUpdate: async (body) => { const { alias, ...rest } = body; return rest; },   // alias immutable
});

router.use(authenticate, requireModule('samples'));
/* reading the list is allowed for everyone with sample/order access (masked); writing needs the flag */
router.post('/', requireFlag('buyer.confidential'));
router.patch('/:id', requireFlag('buyer.confidential'));
router.post('/:id/toggle', requireFlag('buyer.confidential'));
/* what each buyer owes us — order value, invoices, receipts (amounts need the rates / financial flag) */
router.get('/accounts/summary', catchAsync(async (req, res) => res.json(await receivables.summary(req))));
router.get('/accounts', catchAsync(async (req, res) => res.json(await receivables.buyers(req))));
router.get('/:id/account', catchAsync(async (req, res) => res.json(await receivables.account(req, req.params.id))));
crudRoutes(router, svc);

module.exports = router;
