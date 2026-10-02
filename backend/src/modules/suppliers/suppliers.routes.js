const router = require('express').Router();
const { authenticate, requireModule } = require('../../common/middleware/auth');
const crud = require('../../common/utils/crud');
const crudRoutes = require('../../common/utils/crud-routes');
const Supplier = require('./supplier.model');

const svc = crud(Supplier, {
  label: 'supplier',
  form: 'suppliers',
  search: ['name', 'category', 'location'],
  filters: ['status', 'category'],
  sort: 'name',
});

router.use(authenticate, requireModule('vendors'));
crudRoutes(router, svc);

module.exports = router;
