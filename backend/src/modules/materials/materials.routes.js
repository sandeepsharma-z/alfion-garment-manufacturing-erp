const router = require('express').Router();
const catchAsync = require('../../common/utils/catch-async');
const stock = require('../stock/stock.service');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const { hasFlag } = require('../users/roles');
const crud = require('../../common/utils/crud');
const crudRoutes = require('../../common/utils/crud-routes');
const { plain } = require('../../common/utils/mask');
const Material = require('./material.model');

const present = (doc, user) => {
  const m = plain(doc);
  m.freeQty = m.physicalQty - m.reservedQty;
  m.stockState = doc.stockState ? doc.stockState() : '';
  if (!hasFlag(user, 'rates.view')) delete m.rate;      // rates are a permission (FR-17.2)
  return m;
};

/* Phase 2: physical / reserved are ledger balances — never edited directly (SRS 8.4). */
const stripBalances = (body) => { const { physicalQty, reservedQty, openingQty, ...rest } = body; return rest; };
/* supplierName is denormalised from supplierId so plan rows / POs never need a join (blank when the supplier is cleared) */
const withSupplier = async (body) => {
  const data = stripBalances(body);
  if (data.supplierId !== undefined) {
    const sup = data.supplierId && require('mongoose').isValidObjectId(data.supplierId) ? await require('../suppliers/supplier.model').findById(data.supplierId) : null;
    data.supplierId = sup ? sup._id : undefined; data.supplierName = sup ? sup.name : '';
  }
  if (Array.isArray(data.suppliers)) {
    const Supplier = require('../suppliers/supplier.model');
    const ids = data.suppliers.map((x) => x && x.supplierId).filter((id) => id && require('mongoose').isValidObjectId(id));
    const found = ids.length ? await Supplier.find({ _id: { $in: ids } }) : [];
    data.suppliers = data.suppliers.filter((x) => x && x.supplierId).map((x) => { const sp = found.find((f) => String(f._id) === String(x.supplierId)); return sp ? { supplierId: sp._id, name: sp.name, rate: Math.max(+x.rate || 0, 0), moq: Math.max(+x.moq || 0, 0), leadDays: Math.max(+x.leadDays || 0, 0), note: String(x.note || '') } : null; }).filter(Boolean);
  }
  return data;
};
const svc = crud(Material, {
  label: 'material',
  form: 'materials',
  search: ['code', 'name', 'supplierName', 'godown'],
  filters: ['status', 'category'],
  sort: 'code',
  present,
  beforeCreate: withSupplier,
  beforeUpdate: withSupplier,
});

router.use(authenticate, requireModule('stock'));
router.get('/meta', (req, res) => res.json({ itemTypes: Material.ITEM_TYPES }));

/** GET /materials — list + on-order quantity per material (sum of open PO remaining) */
router.get('/', catchAsync(async (req, res) => {
  const [out, onOrder, atVendor] = await Promise.all([svc.list(req), stock.onOrderMap(), require('../jobwork/jobwork.service').atVendorMap()]);
  out.items.forEach((m) => { const o = onOrder[m.id] || { qty: 0, count: 0 }; m.onOrder = o.qty; m.openPos = o.count; const v = atVendor[m.id] || { qty: 0, count: 0 }; m.atVendor = v.qty; m.openJw = v.count; });
  res.json(out);
}));
/** POST /materials — create; an opening quantity becomes the first ledger row */
router.post('/', catchAsync(async (req, res) => {
  const created = await svc.create(req, req.body);
  const opening = +(req.body || {}).openingQty || 0;
  if (opening > 0) {
    await stock.post({ materialId: created.id, txn: 'opening', qty: opening, refType: 'adjust', godown: created.godown, note: 'Opening stock', by: req.user.name });
    created.physicalQty = opening; created.freeQty = opening;
  }
  res.status(201).json(created);
}));
crudRoutes(router, svc);

module.exports = router;
