const router = require('express').Router();
const { authenticate, requireModule, requireFlag } = require('../../common/middleware/auth');
const crud = require('../../common/utils/crud');
const crudRoutes = require('../../common/utils/crud-routes');
const { presentVendor } = require('../../common/utils/mask');
const { nextSeq, pad } = require('../../common/utils/counters');
const Vendor = require('./vendor.model');

const svc = crud(Vendor, {
  label: 'vendor',
  form: 'vendors',
  search: ['name', 'category', 'location', 'alias'],
  filters: ['status', 'category'],
  sort: 'name',
  present: presentVendor,
  beforeCreate: async (body) => ({ ...body, alias: `V-${pad(await nextSeq('vendor'), 2)}` }),
  beforeUpdate: async (body) => { const { alias, ...rest } = body; return rest; },
});

router.use(authenticate, requireModule('vendors'));
router.get('/meta/processes', (req, res) => res.json({ processes: Vendor.PROCESSES }));
router.post('/', requireFlag('vendor.confidential'));
router.patch('/:id', requireFlag('vendor.confidential'));
router.post('/:id/toggle', requireFlag('vendor.confidential'));
crudRoutes(router, svc);

module.exports = router;
